import { describe, expect, it, vi } from 'vitest';
import { PostgrestClient } from '@supabase/postgrest-js';
import { getGrammarPoint, getGrammarReadings, normalizeGrammarPoint } from './grammar';

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

describe('getGrammarReadings', () => {
  function fakeClient(markers: string[], readings: any[]) {
    const calls: Record<string, any[]> = { contains: [], eq: [] };
    const grammarQuery: any = {
      select: vi.fn(() => grammarQuery),
      eq: vi.fn((...args: any[]) => { calls.eq.push(args); return grammarQuery; }),
      maybeSingle: vi.fn(async () => ({ data: { markers }, error: null })),
    };
    const readingQuery: any = {
      select: vi.fn(() => readingQuery),
      contains: vi.fn((...args: any[]) => { calls.contains.push(args); return readingQuery; }),
      order: vi.fn(async () => ({ data: readings, error: null })),
    };
    const client: any = {
      from: vi.fn((table: string) => (table === 'grammar_points' ? grammarQuery : readingQuery)),
    };
    return { client, calls };
  }

  it('filtra las lecturas por (nivel, código), no por código solo', async () => {
    const { client, calls } = fakeClient(['看看'], []);

    await getGrammarReadings(2, '2.2.1', client);

    expect(client.from).toHaveBeenCalledWith('reading');
    expect(calls.contains).toEqual([['target_grammar', JSON.stringify([{ code: '2.2.1', level: 2 }])]]);
    expect(calls.eq).toEqual([['hsk_level', 2], ['code', '2.2.1']]);
  });

  // target_grammar es jsonb: postgrest-js convierte un array JS en un literal de
  // array de Postgres ({[object Object]}) y PostgREST responde «invalid input
  // syntax for type json». El filtro tiene que llegar como JSON.
  it('envía a PostgREST un filtro cs. que es JSON válido', async () => {
    const urls: string[] = [];
    const fetch = vi.fn(async (url: string) => {
      urls.push(String(url));
      const body = String(url).includes('/grammar_points') ? { markers: [] } : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client: any = new PostgrestClient('http://local.test/rest/v1', { fetch: fetch as never });

    await getGrammarReadings(2, '2.2.1', client);

    const readingUrl = new URL(urls.find(url => url.includes('/reading'))!);
    const filter = readingUrl.searchParams.get('target_grammar') ?? '';
    expect(filter.startsWith('cs.')).toBe(true);
    expect(JSON.parse(filter.slice(3))).toEqual([{ code: '2.2.1', level: 2 }]);
  });

  it('devuelve cada lectura con la primera frase que contiene un marcador', async () => {
    const { client } = fakeClient(['看看', '试一试'], [
      {
        slug: 'home-01-morning',
        title: '星期天',
        sentences: [
          { zh: '星期天我六点起床。', pinyin: '', es: '' },
          { zh: '我想试一试。', pinyin: '', es: '' },
          { zh: '你看看。', pinyin: '', es: '' },
        ],
      },
    ]);

    await expect(getGrammarReadings(2, '2.2.1', client)).resolves.toEqual([
      { slug: 'home-01-morning', title: '星期天', sentence: '我想试一试。' },
    ]);
  });

  it('deja la frase vacía si ninguna contiene un marcador', async () => {
    const { client } = fakeClient(['看看'], [
      { slug: 'x', title: 'X', sentences: [{ zh: '我喝茶。', pinyin: '', es: '' }] },
    ]);

    await expect(getGrammarReadings(2, '2.2.1', client)).resolves.toEqual([
      { slug: 'x', title: 'X', sentence: '' },
    ]);
  });
});
