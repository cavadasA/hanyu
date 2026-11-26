// Contrato de apps/mobile/assets/hanzi-writer/writing-strokes.json: los trazos (contorno SVG
// y mediana) de cada carácter de escritura (书写字) de HSK 1–3, con los que CharacterWriting
// dibuja el contorno en `guided` y valida el orden en `quiz`, sin red (Plan 13, Tarea 2).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => JSON.parse(readFileSync(join(rootDir, path), 'utf8'));
const bundled = read('apps/mobile/assets/hanzi-writer/writing-strokes.json');
const characters = read('server/db/seeds/hsk-characters.json');
const decomposition = read('server/db/seeds/hanzi-decomposition.json');

describe('trazos empaquetados para escribir', () => {
  it('todo carácter con handwriting = true tiene trazos, y ningún otro', () => {
    const handwriting = characters.filter(entry => entry.handwriting).map(entry => entry.hanzi).sort();
    expect(handwriting).toHaveLength(250);
    expect(Object.keys(bundled).sort()).toEqual(handwriting);
  });

  it('cada carácter trae un contorno y una mediana por trazo', () => {
    for (const [char, entry] of Object.entries(bundled)) {
      expect(entry.strokes.length, char).toBeGreaterThan(0);
      expect(entry.medians, char).toHaveLength(entry.strokes.length);
      for (const path of entry.strokes) expect(path, char).toMatch(/^M /);
      for (const median of entry.medians) expect(median.length, char).toBeGreaterThan(1);
    }
  });

  it('salen del mismo Make Me a Hanzi que server/db/seeds/hanzi-decomposition.json', () => {
    const shared = Object.keys(bundled).filter(char => decomposition[char]);
    // Los 100 de HSK 1–2, y los de HSK 3 que ya aparecen en palabras de HSK 1–2.
    expect(shared.length).toBeGreaterThanOrEqual(100);
    for (const char of shared) {
      expect(bundled[char], char).toEqual({ strokes: decomposition[char].strokes, medians: decomposition[char].medians });
    }
  });
});
