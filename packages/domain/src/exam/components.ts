// Caracteres incompletos de 书写 1: el carácter dibujado sin los trazos de un componente y un
// recuadro punteado en su lugar. Se genera en la build con los trazos de hanzi-writer-data y
// la descomposición de Make Me a Hanzi; no hay imágenes de caracteres hechas a mano.
import type { HanziDecomposition } from './types.ts';

const IDC_ARITY: Record<string, number> = {
  '⿰': 2, '⿱': 2, '⿲': 3, '⿳': 3, '⿴': 2, '⿵': 2, '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2,
};

/** Hijos directos de una descripción IDS, cada uno como texto (un carácter o una IDS anidada). */
export function directComponents(ids: string): string[] {
  const chars = Array.from(ids);
  let position = 0;
  const read = (): string => {
    const start = position;
    const char = chars[position++];
    const arity = IDC_ARITY[char] ?? 0;
    for (let child = 0; child < arity && position < chars.length; child += 1) read();
    return chars.slice(start, position).join('');
  };
  const root = chars[position++];
  const children: string[] = [];
  for (let child = 0; child < (IDC_ARITY[root] ?? 0) && position < chars.length; child += 1) children.push(read());
  return children;
}

/** Posición del componente entre los hijos directos de la IDS, o -1 si no es uno de ellos. */
export function missingComponentIndex(ids: string, component: string): number {
  return directComponents(ids).indexOf(component);
}

function bounds(paths: string[]) {
  const numbers = paths.flatMap(path => (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number));
  const xs = numbers.filter((_, index) => index % 2 === 0);
  const ys = numbers.filter((_, index) => index % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const PADDING = 30;
/** hanzi-writer-data dibuja con y hacia arriba y el origen desplazado 900 unidades. */
const BASELINE = 900;

export function incompleteCharacterSvg(
  hanzi: string,
  missingComponent: string,
  strokes: string[],
  decomposition: HanziDecomposition,
): string {
  const child = missingComponentIndex(decomposition.decomposition, missingComponent);
  if (child === -1) {
    throw new Error(`${missingComponent} no es componente directo de ${hanzi} (${decomposition.decomposition})`);
  }

  const removed = strokes.filter((_, index) => decomposition.matches[index]?.[0] === child);
  const kept = strokes.filter((_, index) => decomposition.matches[index]?.[0] !== child);
  if (removed.length === 0) {
    throw new Error(`${hanzi}: ningún trazo pertenece a ${missingComponent}`);
  }

  const box = bounds(removed);
  const x = Math.max(0, Math.floor(box.minX - PADDING));
  const y = Math.max(0, Math.floor(BASELINE - box.maxY - PADDING));
  const width = Math.ceil(box.maxX - box.minX + 2 * PADDING);
  const height = Math.ceil(box.maxY - box.minY + 2 * PADDING);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">',
    `<g transform="translate(0, ${BASELINE}) scale(1, -1)" fill="currentColor">`,
    ...kept.map(path => `<path d="${path}"/>`),
    '</g>',
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="12" stroke-dasharray="40 24"/>`,
    '</svg>',
  ].join('');
}
