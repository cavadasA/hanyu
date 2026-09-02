//
// El corpus se genera desde ficheros que no están en el repositorio (data/ está
// en .gitignore por tamaño). Sin un manifiesto con sumas de verificación,
// "reproducible" no significa nada: dos clones pueden producir corpus
// distintos sin que nadie se entere. Este módulo fija qué bytes exactos son la
// fuente y permite comprobarlo en cualquier momento.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(rootDir, 'data', 'sources.json');

export function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8')).files;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function verifyLocalSources() {
  return loadManifest().map((entry) => {
    const absolute = join(rootDir, entry.path);

    if (!existsSync(absolute)) {
      return { id: entry.id, status: 'missing' };
    }

    const actual = sha256(readFileSync(absolute));
    return {
      id: entry.id,
      status: actual === entry.sha256 ? 'ok' : 'mismatch',
      expected: entry.sha256,
      actual,
    };
  });
}

export async function fetchSources() {
  mkdirSync(join(rootDir, 'data'), { recursive: true });

  for (const entry of loadManifest()) {
    const response = await fetch(entry.url);
    if (!response.ok) {
      throw new Error(`${entry.id}: HTTP ${response.status} en ${entry.url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const actual = sha256(buffer);

    if (actual !== entry.sha256) {
      // La fuente cambió respecto a la revisión fijada. Puede ser una
      // corrección del sílabo o una regresión del transcriptor: es una
      // decisión editorial, no algo que este script deba resolver solo.
      throw new Error(
        `${entry.id}: la suma no coincide.\n  esperada ${entry.sha256}\n  obtenida ${actual}\n` +
          'Revisa el cambio antes de actualizar data/sources.json.',
      );
    }

    writeFileSync(join(rootDir, entry.path), buffer);
    console.log(`${entry.id} -> ${entry.path} (${buffer.length} bytes)`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('fetch-syllabus.js')) {
  await fetchSources();
}
