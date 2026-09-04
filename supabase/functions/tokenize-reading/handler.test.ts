import { describe, expect, it, vi } from 'vitest';
import { handleTokenizeReading } from './handler';

function queryResult(result: Record<string, unknown>) {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

describe('handleTokenizeReading', () => {
  it('rejects requests without a bearer token', async () => {
    const response = await handleTokenizeReading(
      new Request('https://functions.local/tokenize-reading', {
        method: 'POST',
        body: JSON.stringify({ reading_id: 'reading-1' }),
      }),
      {} as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Missing bearer token' });
  });

  it('returns display-ready tokens with the current SRS state', async () => {
    const reading = queryResult({
      data: { sentences: [{ zh: '你好龘。', pinyin: 'nǐ hǎo dá.', es: 'Hola.' }] },
      error: null,
    });
    const words = queryResult({
      data: [{
        id: 2,
        hanzi: '你好',
        pinyin: 'nǐ hǎo',
        meaning_en: 'hello',
        meaning_es: 'hola',
        hsk_level: 1,
        pos: null,
        frequency: 2,
      }],
      error: null,
    });
    const cards = queryResult({ data: [{ word_id: 2 }], error: null });
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'reading') return reading;
        if (table === 'words') return words;
        if (table === 'srs_cards') return cards;
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const response = await handleTokenizeReading(
      new Request('https://functions.local/tokenize-reading', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ reading_id: 'reading-1' }),
      }),
      client as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tokens: [
        {
          id: 't0',
          text: '你好',
          type: 'word',
          word: {
            id: 2,
            hanzi: '你好',
            pinyin: 'nǐ hǎo',
            meaning_en: 'hello',
            meaning_es: 'hola',
            hsk_level: 1,
            pos: null,
            frequency: 2,
            in_srs: true,
          },
        },
        { id: 't2', text: '龘', type: 'unknown', word: null },
        { id: 't3', text: '。', type: 'punctuation', word: null },
      ],
    });
  });
});
