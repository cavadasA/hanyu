// Empaqueta en el móvil los trazos de los caracteres de escritura (书写字) de HSK 1–3: el
// contorno SVG y la mediana de cada trazo, en el sistema de 1024 unidades de
// hanzi-writer-data. Con ellos CharacterWriting dibuja el contorno en `guided` y valida el
// orden de trazos en `quiz`, sin red (Plan 13, Tarea 2).
//
// Sale de graphics.txt de Make Me a Hanzi (https://github.com/skishore/makemeahanzi), que no
// se guarda en el repositorio y se pasa por argumento, como en import-hanzi-data.js:
//
//   node scripts/build-writing-strokes.js <graphics.txt>
//
// Licencia de los datos: Arphic Public License (ver server/db/seeds/LICENSES.md).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
export const assetFile = join(rootDir, 'apps', 'mobile', 'assets', 'hanzi-writer', 'writing-strokes.json');

export function handwritingCharacters() {
  const characters = JSON.parse(readFileSync(join(rootDir, 'server', 'db', 'seeds', 'hsk-characters.json'), 'utf8'));
  return characters.filter(entry => entry.handwriting).map(entry => entry.hanzi).sort();
}

export function buildWritingStrokes(graphicsRows, wanted) {
  const graphics = new Map(graphicsRows.map(row => [row.character, row]));
  const out = {};
  for (const char of wanted) {
    const row = graphics.get(char);
    if (!row?.strokes?.length || row.medians?.length !== row.strokes.length) {
      throw new Error(`Make Me a Hanzi no trae los trazos de ${char}`);
    }
    out[char] = { strokes: row.strokes, medians: row.medians };
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('build-writing-strokes.js')) {
  const [graphicsPath] = process.argv.slice(2);
  if (!graphicsPath) {
    console.error('Uso: build-writing-strokes.js <graphics.txt>');
    process.exit(2);
  }
  const rows = readFileSync(graphicsPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const strokes = buildWritingStrokes(rows, handwritingCharacters());
  mkdirSync(dirname(assetFile), { recursive: true });
  writeFileSync(assetFile, `${JSON.stringify(strokes)}\n`);
  console.log(`${Object.keys(strokes).length} caracteres → ${assetFile}`);
}
