//
// El esquema oficial de gramática es una jerarquía de cuatro niveles con
// secciones numeradas y viñetas. Se convierte en una lista plana de puntos
// —uno por epígrafe hoja— conservando la ruta completa, porque el grupo y la
// categoría son la clasificación que el propio sílabo usa para el examen.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dataDir = join(rootDir, 'data');

const SECTION = /^(\s*)([0-9]+(?:\.[0-9]+)*)\.?\s*(.*)$/;
const BULLET = /^\s*-\s*(.*)$/;

export function parseGrammarOutline(text, level) {
  const points = [];
  const path = new Map(); // profundidad (nº de segmentos) -> título

  let current = null;

  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('=') || line.startsWith('新版HSK')) {
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      if (current && bullet[1].trim()) {
        current.items.push(bullet[1].trim());
      }
      continue;
    }

    const section = SECTION.exec(line);
    if (!section) {
      continue;
    }

    const code = section[2];
    const depth = code.split('.').length;
    const ownTitle = section[3].trim();
    // Algún epígrafe hoja no tiene título en el sílabo («4.1» de 固定格式): se
    // queda con el del padre más cercano, que es lo que lo nombra.
    let title = ownTitle;
    for (let up = depth - 1; !title && up >= 1; up -= 1) title = path.get(up) ?? '';

    path.set(depth, ownTitle);
    for (const key of [...path.keys()]) {
      if (key > depth) path.delete(key);
    }

    // Solo los epígrafes más profundos llevan ítems; los superiores son
    // clasificación. Se crea un punto por cada epígrafe y se descarta después
    // el que resulte ser padre de otro.
    current = {
      code,
      hsk_level: level,
      group: path.get(1) ?? null,
      category: depth >= 2 ? path.get(2) ?? null : null,
      detail: depth >= 3 ? path.get(3) ?? null : null,
      title,
      items: [],
      order_idx: 0,
    };
    points.push(current);
  }

  // Un epígrafe que es prefijo de otro es clasificación, no punto de gramática.
  const codes = new Set(points.map((point) => point.code));
  const leaves = points.filter(
    (point) => ![...codes].some((code) => code !== point.code && code.startsWith(`${point.code}.`)),
  );

  return leaves.map((point, index) => ({ ...point, order_idx: index + 1 }));
}

export function loadOfficialGrammar(level) {
  const text = readFileSync(join(dataDir, `HSK_Grammar_${level}.txt`), 'utf8');
  return parseGrammarOutline(text, level);
}
