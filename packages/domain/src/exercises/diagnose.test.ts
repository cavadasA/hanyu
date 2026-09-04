import { describe, expect, it } from 'vitest';
import { diagnose } from './diagnose';

describe('diagnose', () => {
  it('dice qué posición estaba mal en un reorder', () => {
    const detail = { kind: 'reorder' as const, first_wrong_index: 2 };

    expect(diagnose(detail)).toMatch(/tercera/);
  });

  it('dice cuántas parejas fallaron en un matching', () => {
    const detail = { kind: 'matching' as const, wrong_pairs: ['茶', '咖啡'] };

    expect(diagnose(detail)).toMatch(/2/);
  });

  it('distingue un fallo de tono de uno de sílaba en dictado', () => {
    const detail = { kind: 'dictation' as const, syllables_match: true, tones_match: false };

    expect(diagnose(detail)).toMatch(/tono/i);
  });
});
