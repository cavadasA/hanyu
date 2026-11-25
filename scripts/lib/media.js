// Ficheros de medios del repositorio: cada directorio con un `manifest.json`
// bajo `content/audio/` es un dueño (`readings/<slug>`, `exam/<id>`…) y sus
// clips se publican en Storage como `media/<sha256>.<ext>`. Sólo usa node:fs y
// node:crypto, para que la CI pueda sincronizar sin instalar dependencias.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const defaultContentDir = join(rootDir, 'content', 'audio');
export const defaultIndexFile = join(rootDir, 'server', 'db', 'seeds', 'media-index.json');

const CONTENT_TYPES = { m4a: 'audio/mp4', mp3: 'audio/mpeg' };

export function contentTypeOf(file) {
  const type = CONTENT_TYPES[extname(file).slice(1)];
  if (!type) throw new Error(`Formato de audio no admitido: ${file}`);
  return type;
}

export function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function storagePathFor(sha256, file) {
  return `media/${sha256}${extname(file)}`;
}

/** Todos los manifiestos bajo `contentDir`, con el dueño que da su directorio. */
export function findManifests(contentDir = defaultContentDir) {
  if (!existsSync(contentDir)) return [];

  const found = [];
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (name === 'manifest.json') {
        found.push({
          owner: relative(contentDir, dir).split(sep).join('/'),
          dir,
          manifest: JSON.parse(readFileSync(path, 'utf8')),
        });
      }
    }
  };
  walk(contentDir);
  return found;
}

/** Cada clip declarado con su fichero local y su ruta en Storage. */
export function collectMediaFiles(contentDir = defaultContentDir) {
  return findManifests(contentDir).flatMap(({ owner, dir, manifest }) =>
    manifest.clips
      .filter(clip => existsSync(join(dir, clip.file)))
      .map(clip => {
        const file = join(dir, clip.file);
        return {
          owner,
          key: clip.key,
          file,
          storagePath: storagePathFor(fileSha256(file), clip.file),
          contentType: contentTypeOf(clip.file),
        };
      }),
  );
}
