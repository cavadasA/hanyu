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

  it('cuenta cada forma desconocida fuera de diccionario una sola vez', () => {
    const repeatedUnknown = [
      { word_id: null, type: 'unknown' as const, form: '龘' },
      { word_id: null, type: 'unknown' as const, form: '龘' },
      { word_id: 1, type: 'word' as const },
    ];

    expect(coverageOf(repeatedUnknown, new Set([1]))).toEqual({
      ratio: 0.5,
      known_count: 1,
      unknown_count: 1,
    });
  });

  it('devuelve cobertura cero sin reventar en un texto sin palabras', () => {
    expect(coverageOf([{ word_id: null, type: 'punctuation' }], new Set()).ratio).toBe(0);
  });
});
