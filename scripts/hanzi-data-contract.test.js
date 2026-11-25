// Contrato de server/db/seeds/hanzi-decomposition.json: el subconjunto de Make Me a Hanzi
// (descomposición y trazos) para los caracteres de HSK 1–2. Lo usan el validador de
// 书写 1 y la build que dibuja los caracteres incompletos (Plan 12).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const seedDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'server', 'db', 'seeds');
const read = file => JSON.parse(readFileSync(join(seedDir, file), 'utf8'));
const data = read('hanzi-decomposition.json');

function hskCharacters() {
  const chars = new Set(read('hsk-characters.json').filter(entry => entry.hsk_level <= 2).map(entry => entry.hanzi));
  for (const word of [...read('hsk1-words.json'), ...read('hsk2-words.json')]) {
    for (const char of word.hanzi) if (/\p{Script=Han}/u.test(char)) chars.add(char);
  }
  return chars;
}

describe('datos de caracteres (Make Me a Hanzi)', () => {
  it('cubre todos los caracteres de HSK 1–2 y nada más', () => {
    expect(new Set(Object.keys(data))).toEqual(hskCharacters());
  });

  it('cada carácter trae descomposición IDS, y un match por trazo', () => {
    for (const [char, entry] of Object.entries(data)) {
      expect(entry.decomposition, char).toMatch(/^\S+$/u);
      expect(entry.strokes.length, char).toBeGreaterThan(0);
      expect(entry.matches, char).toHaveLength(entry.strokes.length);
    }
  });

  it('declara su licencia en LICENSES.md', () => {
    const licenses = readFileSync(join(seedDir, 'LICENSES.md'), 'utf8');
    expect(licenses).toMatch(/hanzi-decomposition\.json/);
    expect(licenses).toMatch(/Arphic Public License/);
    expect(licenses).toMatch(/LGPL/);
  });
});
