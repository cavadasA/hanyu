import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recognizeHandwriting, strokeSetCost, type Point } from './recognize-handwriting';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const data = JSON.parse(readFileSync(resolve(root, 'server/db/seeds/hanzi-decomposition.json'), 'utf8')) as Record<
  string,
  { medians: Point[][] }
>;
const medians = (char: string) => data[char].medians;

/** Lo que dibuja un alumno: el carácter más pequeño, desplazado y con algo de temblor. */
function handwritten(char: string, { scale = 0.6, dx = 120, dy = -80, jitter = 18 } = {}): Point[][] {
  let seed = 7;
  const noise = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return (seed / 233280 - 0.5) * 2 * jitter;
  };
  return medians(char).map(stroke => stroke.map(([x, y]) => [x * scale + dx + noise(), y * scale + dy + noise()] as Point));
}

const candidates = Object.fromEntries(['学', '字', '好', '子', '大', '人', '十', '不', '我', '是', '水', '工'].map(char => [char, medians(char)]));

describe('recognizeHandwriting', () => {
  it('reconoce un carácter escrito más pequeño, desplazado y con temblor', () => {
    expect(recognizeHandwriting(handwritten('学'), candidates).recognized).toBe('学');
    expect(recognizeHandwriting(handwritten('好'), candidates).recognized).toBe('好');
    expect(recognizeHandwriting(handwritten('水', { scale: 1.1, dx: -40 }), candidates).recognized).toBe('水');
  });

  it('acepta los trazos en cualquier orden: el examen evalúa el carácter, no el orden', () => {
    const strokes = handwritten('学');
    const shuffled = [strokes[5], strokes[0], strokes[7], strokes[2], strokes[1], strokes[6], strokes[3], strokes[4]];
    expect(recognizeHandwriting(shuffled, candidates).recognized).toBe('学');
  });

  it('acepta un trazo escrito al revés', () => {
    const strokes = handwritten('十');
    strokes[0] = [...strokes[0]].reverse();
    expect(recognizeHandwriting(strokes, candidates).recognized).toBe('十');
  });

  it('con un trazo de menos no reconoce el carácter que quería escribir', () => {
    const strokes = handwritten('学').slice(0, 7);
    expect(recognizeHandwriting(strokes, candidates).recognized).not.toBe('学');
  });

  it('garabatos que no se parecen a nada → null', () => {
    const scribble: Point[][] = [
      [[100, 100], [900, 900]],
      [[900, 100], [100, 900]],
      [[500, 50], [520, 980]],
    ];
    expect(recognizeHandwriting(scribble, candidates).recognized).toBeNull();
  });

  it('sin trazos → null', () => {
    expect(recognizeHandwriting([], candidates)).toEqual({ recognized: null, strokes: 0, mistakes: 0 });
  });
});

describe('strokeSetCost', () => {
  it('el carácter consigo mismo cuesta 0 y un número distinto de trazos es infinito', () => {
    expect(strokeSetCost(medians('大'), medians('大'))).toBeCloseTo(0, 5);
    expect(strokeSetCost(medians('大'), medians('学'))).toBe(Number.POSITIVE_INFINITY);
  });

  it('un 工 escrito cuesta menos contra 工 que contra otros tres trazos', () => {
    expect(strokeSetCost(handwritten('工'), medians('工'))).toBeLessThan(strokeSetCost(handwritten('工'), medians('不').slice(0, 3)));
  });
});

describe('recognizeHandwriting con los 100 caracteres de escritura de HSK 1–2', () => {
  it('reconoce cada uno escrito con proporciones cambiadas y cada trazo desplazado', () => {
    const characters = JSON.parse(readFileSync(resolve(root, 'server/db/seeds/hsk-characters.json'), 'utf8')) as Array<{
      hanzi: string;
      hsk_level: number;
      handwriting: boolean;
    }>;
    const handwriting = characters.filter(entry => entry.handwriting && entry.hsk_level <= 2).map(entry => entry.hanzi);
    const all = Object.fromEntries(handwriting.map(char => [char, medians(char)]));
    let seed = 3;
    const noise = (size: number) => {
      seed = (seed * 9301 + 49297) % 233280;
      return (seed / 233280 - 0.5) * 2 * size;
    };
    const wrong = handwriting.filter(char => {
      const strokes = medians(char).map(stroke => {
        const [ox, oy] = [noise(45), noise(45)];
        return stroke.map(([x, y]) => [x * 0.5 + 100 + ox + noise(9), y * 0.7 - 50 + oy + noise(9)] as Point);
      });
      return recognizeHandwriting(strokes, all).recognized !== char;
    });
    expect(handwriting).toHaveLength(100);
    expect(wrong).toEqual([]);
  });
});
