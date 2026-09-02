//
// El corpus es un artefacto generado por scripts/import-hsk-data.js. Este
// fichero fija su contrato: qué garantías debe cumplir el resultado,
// independientemente de cómo se genere. Un fallo aquí significa que el
// importador ha vuelto a mezclar sentidos, no que el test esté mal.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');

export function loadCorpus() {
  const rows = [];

  for (const level of [1, 2, 3]) {
    const file = join(seedDir, `hsk${level}-words.json`);
    for (const word of JSON.parse(readFileSync(file, 'utf8'))) {
      rows.push({ ...word, hsk_level: level });
    }
  }

  return rows;
}

function groupByHanzi(rows) {
  const groups = new Map();

  for (const row of rows) {
    const list = groups.get(row.hanzi) ?? [];
    list.push(row);
    groups.set(row.hanzi, list);
  }

  return groups;
}

function normalizeReadingIdentity(input) {
  return input.normalize('NFC').toLowerCase().replace(/[\s'’·-]/g, '');
}

describe('contrato del corpus', () => {
  const rows = loadCorpus();

  it('tiene el tamaño esperado', () => {
    expect(rows).toHaveLength(1010);
  });

  it('nunca da la misma glosa inglesa a dos lecturas distintas del mismo hanzi', () => {
    const offenders = [];

    for (const [hanzi, list] of groupByHanzi(rows)) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i];
          const b = list[j];

          if (
            normalizeReadingIdentity(a.pinyin) ===
            normalizeReadingIdentity(b.pinyin)
          ) {
            continue;
          }

          if (a.meaning_en === b.meaning_en) {
            offenders.push(`${hanzi} ${a.pinyin}/${b.pinyin}: "${a.meaning_en}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no deja el clasificador incrustado dentro de la glosa inglesa', () => {
    const offenders = rows
      .filter((row) => /CL:/.test(row.meaning_en))
      .map((row) => `${row.hanzi} ${row.pinyin}: "${row.meaning_en}"`);

    expect(offenders).toEqual([]);
  });

  it('da glosa española a todas las filas', () => {
    const offenders = rows
      .filter((row) => !row.meaning_es || !String(row.meaning_es).trim())
      .map((row) => `${row.hanzi} ${row.pinyin} L${row.hsk_level}`);

    expect(offenders).toEqual([]);
  });

  it('declara en la cola de revisión toda fila que repite lectura entre niveles', () => {
    const repeated = [];

    for (const [hanzi, list] of groupByHanzi(rows)) {
      const readings = new Set(
        list.map((row) => normalizeReadingIdentity(row.pinyin)),
      );
      if (list.length > 1 && readings.size === 1) {
        repeated.push(hanzi);
      }
    }

    const queued = JSON.parse(
      readFileSync(join(seedDir, 'sense-review-queue.json'), 'utf8'),
    ).map((entry) => entry.hanzi);

    expect(repeated.sort()).toEqual(queued.sort());
  });
});
