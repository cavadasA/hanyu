import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { ReviewStore } from './ReviewStore';

let activeStore: ReviewStore | null = null;

export function setReadingCacheStore(store: ReviewStore | null): void {
  activeStore = store;
}

function store(key: string, value: string): Promise<void> {
  return activeStore?.setReadingCache(key, value) ?? AsyncStorage.setItem(key, value);
}

// Clips de las lecturas guardadas para leer sin red. El nombre en Storage es
// el sha256 del fichero, así que el nombre local también lo es: un clip nunca
// cambia de contenido y basta con descargarlo una vez.
const audioDir = () => new Directory(Paths.document, 'reading-audio');

function localClip(url: string): File {
  const name = url.split('?')[0].split('/').pop() ?? url;
  return new File(audioDir(), name);
}

async function localizeClip(clip: unknown, download: boolean): Promise<unknown> {
  if (!clip || typeof clip !== 'object' || typeof (clip as { url?: unknown }).url !== 'string') return clip;
  const { url } = clip as { url: string };
  if (url.startsWith('file://')) return clip;

  const file = localClip(url);
  if (!file.exists) {
    if (!download) return null;
    try {
      const dir = audioDir();
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      await File.downloadFileAsync(url, file);
    } catch {
      return null;
    }
  }
  return { ...(clip as object), url: file.uri };
}

async function localizeValue(value: unknown, download: boolean): Promise<{ value: unknown; changed: boolean }> {
  if (Array.isArray(value)) {
    let changed = false;
    const items = [];
    for (const item of value) {
      const result = await localizeValue(item, download);
      changed ||= result.changed;
      items.push(result.value);
    }
    return { value: items, changed };
  }
  if (!value || typeof value !== 'object' || !Array.isArray((value as { sentence_audio?: unknown }).sentence_audio)) {
    return { value, changed: false };
  }

  const reading = value as { sentence_audio: unknown[] };
  if (!reading.sentence_audio.some(clip => clip !== null)) return { value, changed: false };
  const sentence_audio = [];
  for (const clip of reading.sentence_audio) sentence_audio.push(await localizeClip(clip, download));
  return { value: { ...reading, sentence_audio }, changed: true };
}

/**
 * Copia offline de una lectura (o de una lista de lecturas): cada clip apunta
 * al fichero local. Un clip que no está descargado queda `null`, de modo que
 * el lector sin red dice qué frase no tiene audio en vez de saltarla. Con
 * `download`, descarga antes los que falten.
 */
export async function localizeReadingAudio(json: string, { download }: { download: boolean }): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  const result = await localizeValue(parsed, download);
  return result.changed ? JSON.stringify(result.value) : json;
}

const pending = new Set<Promise<void>>();
const latestWrite = new Map<string, number>();

/** Para los tests: espera a que acaben las descargas en curso. */
export async function waitForReadingAudioDownloads(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}

export const readingCache = {
  getItem(key: string): Promise<string | null> {
    return activeStore?.getReadingCache(key) ?? AsyncStorage.getItem(key);
  },
  /**
   * Guarda al momento la copia con los clips ya descargados y descarga el resto
   * en segundo plano: la caché la escribe cada carga de la lista y no debe
   * esperar a la red. Al acabar, vuelve a guardar, salvo que ya haya otra
   * escritura más reciente de la misma clave.
   */
  async setItem(key: string, value: string): Promise<void> {
    const write = (latestWrite.get(key) ?? 0) + 1;
    latestWrite.set(key, write);
    const now = await localizeReadingAudio(value, { download: false });
    await store(key, now);
    if (now === value) return;

    const job = localizeReadingAudio(value, { download: true })
      .then(downloaded => (latestWrite.get(key) === write && downloaded !== now ? store(key, downloaded) : undefined))
      .catch(() => undefined)
      .finally(() => pending.delete(job));
    pending.add(job);
  },
};
