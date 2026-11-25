// Empaqueta en el móvil las medianas de los caracteres de escritura (书写字) de HSK 1–2:
// con ellas CharacterWriting reconoce, sin red, qué carácter ha escrito el alumno en
// 书写 2 del simulacro. Sale de server/db/seeds/hanzi-decomposition.json.
//
//   node scripts/build-handwriting-assets.js
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');
export const assetFile = join(rootDir, 'apps', 'mobile', 'assets', 'hanzi-writer', 'handwriting-medians.json');
const read = file => JSON.parse(readFileSync(join(seedDir, file), 'utf8'));

export function handwritingMedians() {
  const data = read('hanzi-decomposition.json');
  const characters = read('hsk-characters.json')
    .filter(entry => entry.handwriting && entry.hsk_level <= 2)
    .map(entry => entry.hanzi)
    .sort();
  return Object.fromEntries(characters.map(char => [char, data[char].medians]));
}

if (process.argv[1] && process.argv[1].endsWith('build-handwriting-assets.js')) {
  mkdirSync(dirname(assetFile), { recursive: true });
  const medians = handwritingMedians();
  writeFileSync(assetFile, `${JSON.stringify(medians)}\n`);
  console.log(`${Object.keys(medians).length} caracteres → ${assetFile}`);
}
