import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyGrammarContent,
  buildGrammar,
  loadGrammarFiles,
  summarize,
} from './build-grammar.js';

function entry(hsk_level, code, overrides = {}) {
  return {
    hsk_level,
    code,
    pattern: '不 + verbo',
    explanation: 'Niega una acción habitual o una intención.',
    markers: ['不'],
    examples: [
      { zh: '我不喝茶。', pinyin: 'Wǒ bù hē chá.', es: 'No bebo té.' },
      { zh: '他不去。', pinyin: 'Tā bú qù.', es: 'Él no va.' },
      { zh: '我不吃。', pinyin: 'Wǒ bù chī.', es: 'No como.' },
    ],
    common_errors: [{ wrong: '我不喝了茶。', right: '我没喝茶。', why: 'Para una acción pasada se niega con 没.' }],
    see_also: [],
    ...overrides,
  };
}

function dirWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'grammar-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content), 'utf8');
  }
  return dir;
}

const official = [
  { hsk_level: 1, code: '2.6.6' },
  { hsk_level: 2, code: '2.6.6' },
  { hsk_level: 2, code: '2.2.1' },
];

const dictionary = ['我', '他', '不', '喝', '茶', '去', '吃'].map(hanzi => ({ hanzi, hsk_level: 1 }));

describe('build-grammar', () => {
  it('aplica 2-2.6.6.json al punto (2, 2.6.6) y no al (1, 2.6.6)', () => {
    const points = [
      { hsk_level: 1, code: '2.6.6', title: 'nivel 1', pattern: null, explanation: null, examples: [] },
      { hsk_level: 2, code: '2.6.6', title: 'nivel 2', pattern: null, explanation: null, examples: [] },
    ];

    applyGrammarContent(points, [entry(2, '2.6.6')]);

    expect(points[1].explanation).toBe('Niega una acción habitual o una intención.');
    expect(points[1].common_errors).toHaveLength(1);
    expect(points[1].markers).toEqual(['不']);
    expect(points[0].explanation).toBeNull();
    expect(points[0].examples).toEqual([]);
  });

  it('rechaza un fichero cuyo nombre no casa con su nivel y código', () => {
    const dir = dirWith({ '1-2.6.6.json': entry(2, '2.6.6') });

    expect(() => loadGrammarFiles(dir)).toThrow(/1-2\.6\.6\.json/);
  });

  it('rechaza un fichero para un punto que no está en el sílabo', () => {
    const dir = dirWith({ '3-9.9.9.json': entry(3, '9.9.9') });

    const result = buildGrammar({ dir, official, dictionary });

    expect(result.issues).toEqual([{ file: '3-9.9.9.json', kind: 'unknown_point' }]);
  });

  it('cuenta los puntos con fichero por nivel y pasa el validador', () => {
    const dir = dirWith({ '2-2.6.6.json': entry(2, '2.6.6'), '1-2.6.6.json': entry(1, '2.6.6') });

    const result = buildGrammar({ dir, official, dictionary });

    expect(result.issues).toEqual([]);
    expect(result.counts).toEqual({ 1: { done: 1, total: 1 }, 2: { done: 1, total: 2 }, 3: { done: 0, total: 0 } });
    expect(result.missing).toEqual([{ hsk_level: 2, code: '2.2.1' }]);
  });

  it('lleva al resultado los problemas del validador con su fichero', () => {
    const dir = dirWith({ '1-2.6.6.json': entry(1, '2.6.6', { markers: [] }) });

    const result = buildGrammar({ dir, official, dictionary });

    expect(result.issues).toEqual([{ file: '1-2.6.6.json', kind: 'no_markers' }]);
  });

  it('imprime el resumen por nivel y falla con issues', () => {
    const result = { counts: { 1: { done: 49, total: 49 }, 2: { done: 59, total: 59 }, 3: { done: 57, total: 57 } }, issues: [{ file: 'x', kind: 'no_markers' }], missing: [] };

    expect(summarize(result, { complete: false })).toEqual({
      line: 'HSK 1: 49/49 · HSK 2: 59/59 · HSK 3: 57/57 · issues: 1',
      ok: false,
    });
  });

  it('sin --complete acepta puntos sin fichero; con --complete, 164/165 falla', () => {
    const result = {
      counts: { 1: { done: 49, total: 49 }, 2: { done: 58, total: 59 }, 3: { done: 57, total: 57 } },
      issues: [],
      missing: [{ hsk_level: 2, code: '2.2.1' }],
    };

    expect(summarize(result, { complete: false }).ok).toBe(true);
    expect(summarize(result, { complete: true }).ok).toBe(false);
  });

  it('todos los puntos con fichero pasan el validador', () => {
    const result = buildGrammar();

    expect(result.issues.map(issue =>
      `${issue.file}: ${issue.kind}${issue.example_index !== undefined ? ` (ejemplo ${issue.example_index + 1})` : ''}${issue.detail ? ` ${issue.detail}` : ''}`,
    )).toEqual([]);
  });
});
