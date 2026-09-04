import { coverageOf } from './coverage';

describe('coverageOf', () => {
  const tokens = [
    { word_id: 1, type: 'word' as const },
    { word_id: 2, type: 'word' as const },
    { word_id: 3, type: 'word' as const },
    { word_id: null, type: 'punctuation' as const },
  ];

  it('no cuenta la puntuación como vocabulario', () => {
    expect(coverageOf(tokens, new Set([1, 2, 3])).ratio).toBe(1);
  });

  it('calcula la proporción de palabras conocidas', () => {
    expect(coverageOf(tokens, new Set([1, 2])).ratio).toBeCloseTo(2 / 3);
  });

  it('cuenta cada forma repetida una sola vez', () => {
    const repeated = [
      { word_id: 1, type: 'word' as const },
      { word_id: 1, type: 'word' as const },
      { word_id: 9, type: 'word' as const },
    ];

    expect(coverageOf(repeated, new Set([1])).ratio).toBeCloseTo(0.5);
  });

  it('devuelve cobertura cero sin reventar en un texto sin palabras', () => {
    expect(coverageOf([{ word_id: null, type: 'punctuation' }], new Set()).ratio).toBe(0);
  });
});
