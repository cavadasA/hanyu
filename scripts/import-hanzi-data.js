// Extrae de Make Me a Hanzi (https://github.com/skishore/makemeahanzi) la descomposición,
// los trazos y sus medianas de los caracteres de HSK 1–2 y los escribe en
// server/db/seeds/hanzi-decomposition.json. Los ficheros de origen no se guardan en el
// repositorio; se descargan aparte y se pasan por argumento:
//
//   node scripts/import-hanzi-data.js <dictionary.txt> <graphics.txt>
//
// Licencias: dictionary.txt (descomposición) LGPL-3; graphics.txt (trazos) Arphic Public
// License. Ver server/db/seeds/LICENSES.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const seedDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'server', 'db', 'seeds');
const read = file => JSON.parse(readFileSync(join(seedDir, file), 'utf8'));
const lines = path => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));

export function hskCharacters() {
  const chars = new Set(read('hsk-characters.json').filter(entry => entry.hsk_level <= 2).map(entry => entry.hanzi));
  for (const word of [...read('hsk1-words.json'), ...read('hsk2-words.json')]) {
    for (const char of word.hanzi) if (/\p{Script=Han}/u.test(char)) chars.add(char);
  }
  return chars;
}

export function buildHanziData(dictionaryRows, graphicsRows, wanted) {
  const dictionary = new Map(dictionaryRows.map(row => [row.character, row]));
  const graphics = new Map(graphicsRows.map(row => [row.character, row]));
  const out = {};
  for (const char of [...wanted].sort()) {
    const entry = dictionary.get(char);
    const strokes = graphics.get(char)?.strokes;
    const medians = graphics.get(char)?.medians;
    if (!entry || !strokes || !medians) throw new Error(`Make Me a Hanzi no trae ${char}`);
    out[char] = { decomposition: entry.decomposition, matches: entry.matches, strokes, medians };
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('import-hanzi-data.js')) {
  const [dictionaryPath, graphicsPath] = process.argv.slice(2);
  if (!dictionaryPath || !graphicsPath) {
    console.error('Uso: import-hanzi-data.js <dictionary.txt> <graphics.txt>');
    process.exit(2);
  }
  const data = buildHanziData(lines(dictionaryPath), lines(graphicsPath), hskCharacters());
  writeFileSync(join(seedDir, 'hanzi-decomposition.json'), `${JSON.stringify(data)}\n`);
  console.log(`${Object.keys(data).length} caracteres → server/db/seeds/hanzi-decomposition.json`);
}
