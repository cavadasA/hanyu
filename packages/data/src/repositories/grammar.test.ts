import { describe, expect, it } from 'vitest';
import { normalizeGrammarPoint } from './grammar';

describe('normalizeGrammarPoint', () => {
  it('defaults common_errors and see_also to [] when absent', () => {
    const point = normalizeGrammarPoint({ id: 1, hsk_level: 2, code: '2.1.1', title: 't', examples: '[]' });
    expect(point.common_errors).toEqual([]);
    expect(point.see_also).toEqual([]);
    expect(point.examples).toEqual([]);
  });

  it('keeps provided common_errors and see_also', () => {
    const errors = [{ wrong: 'a', right: 'b', why: 'c' }];
    const seeAlso = [{ hsk_level: 2, code: '2.2.1' }];
    const point = normalizeGrammarPoint({ id: 1, examples: [], common_errors: errors, see_also: seeAlso });
    expect(point.common_errors).toEqual(errors);
    expect(point.see_also).toEqual(seeAlso);
  });
});
