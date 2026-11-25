import AsyncStorage from '@react-native-async-storage/async-storage';
import { localizeReadingAudio, readingCache, waitForReadingAudioDownloads } from './readingCache';

const mockFiles = new Set<string>();
const mockDownload = jest.fn();

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base}/${name}` : base;
    }
    get exists() {
      return true;
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    static downloadFileAsync = (url: string, file: { uri: string }) => mockDownload(url, file);
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs' } } };
});

const reading = (audio: unknown[]) => ({
  slug: 'casa-01',
  audio_kind: 'neural',
  sentence_audio: audio,
});

describe('readingCache y el audio por frase', () => {
  beforeEach(async () => {
    mockFiles.clear();
    mockDownload.mockReset();
    mockDownload.mockImplementation(async (_url: string, file: { uri: string }) => {
      mockFiles.add(file.uri);
      return file;
    });
    await AsyncStorage.clear();
  });

  it('una lectura cacheada devuelve sus clips como ficheros locales', async () => {
    const value = JSON.stringify(reading([
      { url: 'https://cdn.test/storage/v1/object/public/media/aaa.m4a', duration_ms: 1200 },
      { url: 'https://cdn.test/storage/v1/object/public/media/bbb.m4a', duration_ms: 1300 },
    ]));

    await readingCache.setItem('detail:casa-01', value);
    await waitForReadingAudioDownloads();

    const cached = JSON.parse((await readingCache.getItem('detail:casa-01'))!);
    expect(cached.sentence_audio).toEqual([
      { url: 'file:///docs/reading-audio/aaa.m4a', duration_ms: 1200 },
      { url: 'file:///docs/reading-audio/bbb.m4a', duration_ms: 1300 },
    ]);
  });

  it('localiza también las lecturas de una lista', async () => {
    mockFiles.add('file:///docs/reading-audio/aaa.m4a');
    const list = JSON.stringify([reading([{ url: 'https://cdn.test/media/aaa.m4a', duration_ms: 1 }])]);

    const localized = JSON.parse(await localizeReadingAudio(list, { download: false }));

    expect(localized[0].sentence_audio[0].url).toBe('file:///docs/reading-audio/aaa.m4a');
  });

  it('un clip que aún no se descargó queda null en la copia offline: el lector dirá que falta', async () => {
    const value = JSON.stringify(reading([{ url: 'https://cdn.test/media/aaa.m4a', duration_ms: 1 }]));

    const localized = JSON.parse(await localizeReadingAudio(value, { download: false }));

    expect(localized.sentence_audio).toEqual([null]);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('una descarga que falla deja el clip en null', async () => {
    mockDownload.mockRejectedValue(new Error('offline'));
    const value = JSON.stringify(reading([{ url: 'https://cdn.test/media/aaa.m4a', duration_ms: 1 }]));

    const localized = JSON.parse(await localizeReadingAudio(value, { download: true }));

    expect(localized.sentence_audio).toEqual([null]);
  });

  it('no descarga dos veces el mismo clip', async () => {
    const value = JSON.stringify(reading([{ url: 'https://cdn.test/media/aaa.m4a', duration_ms: 1 }]));

    await localizeReadingAudio(value, { download: true });
    await localizeReadingAudio(value, { download: true });

    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('una lectura tts y los valores que no son lecturas pasan sin cambios', async () => {
    const tts = JSON.stringify({ slug: 'x', audio_kind: 'tts', sentence_audio: [null] });

    expect(await localizeReadingAudio(tts, { download: true })).toBe(tts);
    expect(await localizeReadingAudio('no es json', { download: true })).toBe('no es json');
  });
});
