// Reconocimiento de un carácter escrito a mano (书写 2 del simulacro, Plan 12): qué carácter
// de una lista de candidatos se parece más a los trazos del alumno. No exige orden ni
// sentido de los trazos (el examen evalúa el carácter, no el orden), pero sí el número de
// trazos. Compara con las medianas de Make Me a Hanzi (línea central de cada trazo, en el
// sistema de 1024 unidades de hanzi-writer-data). El dibujo se normaliza por su caja, así
// que el tamaño y la posición en el recuadro no cuentan.

export type Point = [number, number];

const SAMPLES = 16;
/** Coste medio por trazo (en fracciones del lado del carácter) a partir del cual no se reconoce. */
export const RECOGNITION_THRESHOLD = 0.16;
/** Un trazo concreto por encima de esto cuenta como error, aunque el carácter se reconozca. */
const STROKE_MISTAKE = 0.2;

function resample(stroke: Point[], count = SAMPLES): Point[] {
  if (stroke.length === 1) return Array.from({ length: count }, () => stroke[0]);
  const lengths = [0];
  for (let index = 1; index < stroke.length; index += 1) {
    const [x0, y0] = stroke[index - 1];
    const [x1, y1] = stroke[index];
    lengths.push(lengths[index - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = lengths[lengths.length - 1];
  if (total === 0) return Array.from({ length: count }, () => stroke[0]);

  const out: Point[] = [];
  let segment = 1;
  for (let sample = 0; sample < count; sample += 1) {
    const target = (total * sample) / (count - 1);
    while (segment < stroke.length - 1 && lengths[segment] < target) segment += 1;
    const span = lengths[segment] - lengths[segment - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - lengths[segment - 1]) / span));
    const [x0, y0] = stroke[segment - 1];
    const [x1, y1] = stroke[segment];
    out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  }
  return out;
}

/** Centra el conjunto de trazos y lo escala para que su lado mayor mida 1. */
function normalize(strokes: Point[][]): Point[][] {
  const points = strokes.flat();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  const side = Math.max(width, height) || 1;
  const cx = minX + width / 2;
  const cy = minY + height / 2;
  return strokes.map(stroke => resample(stroke).map(([x, y]) => [(x - cx) / side, (y - cy) / side] as Point));
}

function meanDistance(a: Point[], b: Point[]): number {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.hypot(a[index][0] - b[index][0], a[index][1] - b[index][1]);
  return sum / a.length;
}

function strokeCost(user: Point[], expected: Point[]): number {
  return Math.min(meanDistance(user, expected), meanDistance([...user].reverse(), expected));
}

/** Asignación de coste mínimo (algoritmo húngaro) sobre una matriz cuadrada. Devuelve la columna de cada fila. */
function assign(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);
  for (let row = 1; row <= n; row += 1) {
    p[0] = row;
    let column = 0;
    const minv = new Array(n + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array(n + 1).fill(false);
    do {
      used[column] = true;
      const i0 = p[column];
      let delta = Number.POSITIVE_INFINITY;
      let next = 0;
      for (let j = 1; j <= n; j += 1) {
        if (used[j]) continue;
        const current = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (current < minv[j]) {
          minv[j] = current;
          way[j] = column;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          next = j;
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      column = next;
    } while (p[column] !== 0);
    do {
      const previous = way[column];
      p[column] = p[previous];
      column = previous;
    } while (column);
  }
  const result = new Array(n).fill(0);
  for (let j = 1; j <= n; j += 1) result[p[j] - 1] = j - 1;
  return result;
}

function pairCosts(user: Point[][], expected: Point[][]): number[] {
  const a = normalize(user);
  const b = normalize(expected);
  const matrix = a.map(stroke => b.map(target => strokeCost(stroke, target)));
  return assign(matrix).map((column, row) => matrix[row][column]);
}

/** Coste medio por trazo de la mejor correspondencia; infinito si no tienen los mismos trazos. */
export function strokeSetCost(user: Point[][], expected: Point[][]): number {
  if (user.length === 0 || user.length !== expected.length) return Number.POSITIVE_INFINITY;
  const costs = pairCosts(user, expected);
  return costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
}

export interface HandwritingResult {
  recognized: string | null;
  strokes: number;
  /** Trazos que se apartan del carácter reconocido aunque el conjunto se reconozca. */
  mistakes: number;
}

export function recognizeHandwriting(user: Point[][], candidates: Record<string, Point[][]>): HandwritingResult {
  if (user.length === 0) return { recognized: null, strokes: 0, mistakes: 0 };

  let best: { char: string; cost: number } | null = null;
  for (const [char, expected] of Object.entries(candidates)) {
    const cost = strokeSetCost(user, expected);
    if (cost < (best?.cost ?? Number.POSITIVE_INFINITY)) best = { char, cost };
  }

  if (!best || best.cost > RECOGNITION_THRESHOLD) {
    return { recognized: null, strokes: user.length, mistakes: user.length };
  }
  const mistakes = pairCosts(user, candidates[best.char]).filter(cost => cost > STROKE_MISTAKE).length;
  return { recognized: best.char, strokes: user.length, mistakes };
}
