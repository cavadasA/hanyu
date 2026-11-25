import { describe, expect, it } from 'vitest';
import { vocabularyFindings } from './vocabulary';

const dictionary = [
  { hanzi: '我', hsk_level: 1 },
  { hanzi: '们', hsk_level: 1 },
  { hanzi: '我们', hsk_level: 1 },
  { hanzi: '好', hsk_level: 1 },
  { hanzi: '好', hsk_level: 2 },
  { hanzi: '多', hsk_level: 1 },
  { hanzi: '好多', hsk_level: 3 },
  { hanzi: '人', hsk_level: 1 },
  { hanzi: '睡觉', hsk_level: 1 },
  { hanzi: '睡', hsk_level: 3 },
  { hanzi: '了', hsk_level: 1 },
  { hanzi: '一', hsk_level: 1 },
  { hanzi: '个', hsk_level: 1 },
  { hanzi: '很', hsk_level: 1 },
];

describe('vocabularyFindings', () => {
  it('tokeniza con todo el diccionario, como el móvil: un compuesto L3 en un texto HSK 2 da word_above_level', () => {
    expect(vocabularyFindings('好多人。', dictionary, 2)).toEqual([
      { kind: 'word_above_level', text: '好多', level: 3 },
    ]);
  });

  it('el nivel de una forma es el más bajo de sus entradas', () => {
    expect(vocabularyFindings('我们很好。', dictionary, 1)).toEqual([]);
  });

  it('un hanzi que no está en el diccionario es unknown_vocabulary', () => {
    expect(vocabularyFindings('我们很龘。', dictionary, 2)).toEqual([
      { kind: 'unknown_vocabulary', text: '龘' },
    ]);
  });

  it('las formas extra (nombres, formas del punto gramatical) valen en cualquier nivel', () => {
    expect(vocabularyFindings('小林很好。', dictionary, 1, ['小林'])).toEqual([]);
  });

  it('las mitades de un verbo separable del nivel cuentan como vocabulario', () => {
    expect(vocabularyFindings('我睡了一个好觉。', dictionary, 1)).toEqual([]);
  });
});
