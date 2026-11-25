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
      // Medianas: la línea central de cada trazo, con la que se reconoce la escritura a mano.
      expect(entry.medians, char).toHaveLength(entry.strokes.length);
      for (const median of entry.medians) expect(median.length, char).toBeGreaterThanOrEqual(2);
    }
  });

  it('declara su licencia en LICENSES.md', () => {
    const licenses = readFileSync(join(seedDir, 'LICENSES.md'), 'utf8');
    expect(licenses).toMatch(/hanzi-decomposition\.json/);
    expect(licenses).toMatch(/Arphic Public License/);
    expect(licenses).toMatch(/LGPL/);
  });
});

describe('medianas empaquetadas en el móvil', () => {
  it('apps/mobile/assets/hanzi-writer/handwriting-medians.json son las de los 100 caracteres de escritura, al día', async () => {
    const { handwritingMedians } = await import('./build-handwriting-assets.js');
    const bundled = JSON.parse(
      readFileSync(join(seedDir, '..', '..', '..', 'apps', 'mobile', 'assets', 'hanzi-writer', 'handwriting-medians.json'), 'utf8'),
    );
    expect(Object.keys(bundled)).toHaveLength(100);
    expect(bundled).toEqual(handwritingMedians());
  });
});
