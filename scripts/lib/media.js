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
export const defaultImagesDir = join(rootDir, 'content', 'images');

const CONTENT_TYPES = { m4a: 'audio/mp4', mp3: 'audio/mpeg' };
const IMAGE_CONTENT_TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };

export function contentTypeOf(file) {
  const type = CONTENT_TYPES[extname(file).slice(1)];
  if (!type) throw new Error(`Formato de audio no admitido: ${file}`);
  return type;
}

function imageContentTypeOf(file) {
  const type = IMAGE_CONTENT_TYPES[extname(file).slice(1)];
  if (!type) throw new Error(`Formato de imagen no admitido: ${file}`);
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

/** Dueños cuyo audio es provisional y hay que regenerar antes de publicar. */
export function provisionalOwners(contentDir = defaultContentDir) {
  return findManifests(contentDir)
    .filter(({ manifest }) => manifest.provisional === true)
    .map(({ owner }) => owner);
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

/**
 * Cada imagen declarada bajo `content/images/` (p. ej. las del simulacro) con su
 * fichero local y su ruta en Storage: la misma que emite build-exam.
 */
export function collectImageFiles(imagesDir = defaultImagesDir) {
  return findManifests(imagesDir)
    .filter(({ manifest }) => Array.isArray(manifest.images))
    .flatMap(({ owner, dir, manifest }) => manifest.images
      .filter(image => existsSync(join(dir, image.file)))
      .map(image => {
        const file = join(dir, image.file);
        return {
          owner,
          key: image.key,
          file,
          storagePath: storagePathFor(fileSha256(file), image.file),
          contentType: imageContentTypeOf(image.file),
        };
      }));
}

/** Todo lo que el repositorio publica en Storage: audio e imágenes. */
export function collectRepoMediaFiles() {
  return [...collectMediaFiles(), ...collectImageFiles()];
}
