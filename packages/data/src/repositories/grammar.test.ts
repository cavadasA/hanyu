import { describe, expect, it, vi } from 'vitest';
import { getGrammarPoint, normalizeGrammarPoint } from './grammar';

describe('normalizeGrammarPoint', () => {
  it('defaults common_errors and see_also to [] when absent', () => {
    const point = normalizeGrammarPoint({ id: 1, hsk_level: 2, code: '2.1.1', title: 't', examples: '[]' });
    expect(point.common_errors).toEqual([]);
    expect(point.see_also).toEqual([]);
    expect(point.markers).toEqual([]);
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

describe('getGrammarPoint', () => {
  it('pide a la base de datos los errores típicos, see_also y los marcadores', async () => {
    const select = vi.fn(() => query);
    const query: any = {
      select,
      eq: vi.fn(() => query),
      single: vi.fn(async () => ({
        data: {
          id: 7, hsk_level: 2, code: '6.4.3', title: '因果复句', examples: [],
          markers: ['因为'], common_errors: [{ wrong: 'a', right: 'b', why: 'c' }], see_also: [],
        },
        error: null,
      })),
    };
    const client: any = { from: vi.fn(() => query) };

    const point = await getGrammarPoint(2, 7, client);

    const columns = (select.mock.calls[0] as unknown as [string])[0].split(',').map(column => column.trim());
    expect(columns).toEqual(expect.arrayContaining(['markers', 'common_errors', 'see_also']));
    expect(point.common_errors).toEqual([{ wrong: 'a', right: 'b', why: 'c' }]);
    expect(point.markers).toEqual(['因为']);
  });
});
