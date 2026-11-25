// Antes de empezar el simulacro se descarga entero (audio de 听力 e imágenes): sin red a
// mitad de examen no se puede pausar ni repetir nada, así que sin descarga completa no se
// empieza. El nombre en Storage es el sha256 del fichero: el local también, y lo que ya
// está descargado no se vuelve a pedir.
import { useCallback, useEffect, useRef, useState } from 'react';

type Downloader = (url: string) => Promise<string>;

async function downloadToDocuments(url: string): Promise<string> {
  const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const dir = new Directory(Paths.document, 'exam-media');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, url.split('?')[0].split('/').pop() ?? url);
  if (!file.exists) await File.downloadFileAsync(url, file);
  return file.uri;
}

export function useExamDownload(urls: string[] | null, { download = downloadToDocuments }: { download?: Downloader } = {}) {
  const [local, setLocal] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const localRef = useRef(local);
  localRef.current = local;
  const key = (urls ?? []).join('\n');

  useEffect(() => {
    if (!urls) return;
    let cancelled = false;
    setFailed(false);
    (async () => {
      for (const url of urls) {
        if (cancelled) return;
        if (localRef.current[url]) continue;
        try {
          const uri = await download(url);
          if (!cancelled) setLocal(previous => ({ ...previous, [url]: uri }));
        } catch {
          if (!cancelled) setFailed(true);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `key` resume la lista; `attempt` relanza tras un fallo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const total = urls?.length ?? 0;
  const done = (urls ?? []).filter(url => local[url]).length;
  const progress = total === 0 ? (urls ? 1 : 0) : done / total;

  return {
    progress,
    ready: urls !== null && done === total,
    failed,
    localUri: useCallback((url: string) => local[url] ?? null, [local]),
    retry: useCallback(() => setAttempt(value => value + 1), []),
  };
}
