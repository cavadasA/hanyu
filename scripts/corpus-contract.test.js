//
// El corpus es un artefacto generado por scripts/import-hsk-data.js. Este
// fichero fija su contrato: qué garantías debe cumplir el resultado,
// independientemente de cómo se genere. Un fallo aquí significa que el
// importador ha vuelto a mezclar sentidos, no que el test esté mal.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOfficialWords } from './lib/official-terms.js';

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

function loadUnresolvedTerms() {
  return JSON.parse(
    readFileSync(join(seedDir, 'unresolved-hsk-terms.json'), 'utf8'),
  );
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
  const unresolved = loadUnresolvedTerms();

  it('tiene el tamaño esperado', () => {
    const officialKeys = new Set();
    for (const level of [1, 2, 3]) {
      for (const term of loadOfficialWords(level)) {
        officialKeys.add(`${term.form}#${level}#${term.sense_index ?? ''}`);
      }
    }
    const unresolvedKeys = new Set(
      unresolved.map((term) => `${term.form}#${term.hsk_level}#${term.sense_index ?? ''}`),
    );

    expect(rows).toHaveLength(
      [...officialKeys].filter((key) => !unresolvedKeys.has(key)).length,
    );
  });

  it('no repite ninguna clave (hanzi, nivel, sentido)', () => {
    const keys = rows.map((row) => `${row.hanzi}#${row.hsk_level}#${row.sense_index ?? ''}`);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);

    expect(duplicates).toEqual([]);
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

  it('no comparte glosa entre dos sentidos explícitos del mismo hanzi y nivel', () => {
    const offenders = [];
    const groups = new Map();

    for (const row of rows) {
      const key = `${row.hanzi}#${row.hsk_level}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    for (const [key, list] of groups) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i];
          const b = list[j];

          if (
            a.sense_index === null ||
            b.sense_index === null ||
            a.sense_index === b.sense_index
          ) {
            continue;
          }

          for (const field of ['meaning_en', 'meaning_es']) {
            if (a[field] && b[field] && a[field] === b[field]) {
              offenders.push(`${key}#${field}: "${a[field]}"`);
            }
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

  it('contiene exactamente los términos de la lista oficial', () => {
    const problems = [];

    for (const level of [1, 2, 3]) {
      const official = loadOfficialWords(level).map(
        (term) => `${term.form}#${level}#${term.sense_index ?? ''}`,
      );
      const mine = rows
        .filter((row) => row.hsk_level === level)
        .map((row) => `${row.hanzi}#${level}#${row.sense_index ?? ''}`);
      const unresolvedKeys = new Set(
        unresolved
          .filter((term) => term.hsk_level === level)
          .map((term) => `${term.form}#${level}#${term.sense_index ?? ''}`),
      );
      const expected = [...new Set(official)].filter((key) => !unresolvedKeys.has(key));

      for (const term of expected) {
        if (!mine.includes(term)) problems.push(`L${level} falta ${term}`);
      }
      for (const term of mine) {
        if (!official.includes(term)) problems.push(`L${level} sobra ${term}`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('documenta los sentidos sin fuente y no los emite como otra acepción', () => {
    expect(unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hsk_level: 2, form: '花', sense_index: 2 }),
      ]),
    );

    const emitted = new Set(
      rows.map((row) => `${row.hanzi}#${row.hsk_level}#${row.sense_index ?? ''}`),
    );
    expect(
      unresolved.every(
        (term) => !emitted.has(`${term.form}#${term.hsk_level}#${term.sense_index ?? ''}`),
      ),
    ).toBe(true);
  });

  it('reparte las acepciones de 点 según el índice de la fuente', () => {
    const dian = rows
      .filter((row) => row.hanzi === '点')
      .map((row) => `L${row.hsk_level}#${row.sense_index ?? ''}`)
      .sort();

    // La transcripción fijada en data/sources.json publica 点1 en HSK 3.
    expect(dian).toEqual(['L1#1', 'L3#1']);
    expect(unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hsk_level: 2, form: '点', sense_index: 2 }),
      ]),
    );
  });

  it('conserva las variantes de las formas con parte opcional', () => {
    const meiyou = rows.find((row) => row.hanzi === '没有');

    expect(meiyou.variants).toEqual(['没有', '没']);
  });

  it('importa la lista oficial de caracteres', () => {
    const characters = JSON.parse(
      readFileSync(join(seedDir, 'hsk-characters.json'), 'utf8'),
    );
    const perLevel = {};
    for (const entry of characters) {
      perLevel[entry.hsk_level] = (perLevel[entry.hsk_level] ?? 0) + 1;
    }

    expect(perLevel).toEqual({ 1: 246, 2: 125, 3: 284 });
  });

  it('cada carácter oficial es un único carácter', () => {
    const characters = JSON.parse(
      readFileSync(join(seedDir, 'hsk-characters.json'), 'utf8'),
    );
    const bad = characters.filter((entry) => [...entry.hanzi].length !== 1);

    expect(bad).toEqual([]);
  });

  it('resuelve las cinco colisiones de lectura con sentidos distintos', () => {
    const find = (hanzi, pinyin) =>
      rows.find((row) => row.hanzi === hanzi && row.pinyin === pinyin);

    expect(find('还', 'hái').meaning_en).toMatch(/still/);
    expect(find('还', 'huán').meaning_en).toMatch(/to (pay back|return)/);
    expect(find('地', 'de').meaning_en).toMatch(/particle/);
    expect(find('地', 'dì').meaning_en).toMatch(/earth/);
    expect(find('得', 'děi').meaning_en).toMatch(/to have to|must/);
    expect(find('长', 'zhǎng').meaning_en).toMatch(/grow|chief|elder/);
    expect(find('只', 'zhǐ').meaning_en).toMatch(/only|merely/);
  });

  it('guarda el clasificador en su propio campo', () => {
    const di = rows.find((row) => row.hanzi === '地' && row.pinyin === 'dì');

    expect(di.classifier).toBe('片');
  });

  it('guarda la forma tradicional cuando difiere de la simplificada', () => {
    const hai = rows.find((row) => row.hanzi === '还' && row.pinyin === 'hái');

    expect(hai.traditional).toBe('還');
  });

  it('nunca da la misma glosa española a dos lecturas distintas del mismo hanzi', () => {
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

          if (a.meaning_es === b.meaning_es) {
            offenders.push(`${hanzi} ${a.pinyin}/${b.pinyin}: "${a.meaning_es}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('aplica todas las glosas curadas', () => {
    const curated = JSON.parse(
      readFileSync(join(seedDir, 'sense-glosses-es.json'), 'utf8'),
    );

    const missing = curated.filter((entry) => {
      const row = rows.find(
        (candidate) =>
          candidate.hanzi === entry.hanzi &&
          normalizeReadingIdentity(candidate.pinyin) ===
            normalizeReadingIdentity(entry.pinyin),
      );
      return !row || row.meaning_es !== entry.meaning_es;
    });

    expect(missing).toEqual([]);
  });

  it('mantiene un suelo de glosas españolas por nivel', () => {
    const minimumByLevel = { 1: 293, 2: 194, 3: 500 };

    for (const level of [1, 2, 3]) {
      expect(rows.filter((row) => row.hsk_level === level && row.meaning_es).length)
        .toBeGreaterThanOrEqual(minimumByLevel[level]);
    }
  });
});
