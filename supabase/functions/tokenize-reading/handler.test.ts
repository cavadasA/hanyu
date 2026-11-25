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
            sense_index: null,
            variants: [],
            traditional: null,
            pinyin: 'nǐ hǎo',
            meaning_en: 'hello',
            meaning_es: 'hola',
            classifier: null,
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

  it('acepta frases JSON y puede tokenizar varias lecturas en una sola llamada', async () => {
    const reading = queryResult({
      data: [
        { slug: 'reading-1', sentences: JSON.stringify([{ zh: '你好。' }]) },
        { slug: 'reading-2', sentences: [{ zh: '龘。' }] },
      ],
      error: null,
    });
    const words = queryResult({ data: [], error: null });
    const cards = queryResult({ data: [], error: null });
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
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
        body: JSON.stringify({ reading_ids: ['reading-1', 'reading-2'] }),
      }),
      client as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tokens_by_reading: {
        'reading-1': [
          { id: 't0', text: '你', type: 'unknown', word: null },
          { id: 't1', text: '好', type: 'unknown', word: null },
          { id: 't2', text: '。', type: 'punctuation', word: null },
        ],
        'reading-2': [
          { id: 't0', text: '龘', type: 'unknown', word: null },
          { id: 't1', text: '。', type: 'punctuation', word: null },
        ],
      },
    });
  });

  it('aplica la acepción resuelta en la build a cada aparición de la palabra', async () => {
    const reading = queryResult({
      data: {
        sentences: [
          { zh: '会。' },
          { zh: '他会，会。', senses: [{ hanzi: '会', occurrence: 1, hsk_level: 3, sense_index: 2 }] },
        ],
      },
      error: null,
    });
    const words = queryResult({
      data: [
        { id: 1, hanzi: '他', pinyin: 'tā', meaning_en: 'he', meaning_es: 'él', hsk_level: 1, pos: 'pronoun', frequency: 1 },
        { id: 30, hanzi: '会', sense_index: 1, pinyin: 'huì', meaning_en: 'can', meaning_es: 'saber', hsk_level: 1, pos: 'verb', frequency: 1 },
        { id: 31, hanzi: '会', sense_index: 2, pinyin: 'huì', meaning_en: 'meeting', meaning_es: 'reunión', hsk_level: 3, pos: 'noun', frequency: 1 },
      ],
      error: null,
    });
    const cards = queryResult({ data: [], error: null });
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn((table: string) => (table === 'reading' ? reading : table === 'words' ? words : cards)),
    };

    const response = await handleTokenizeReading(
      new Request('https://functions.local/tokenize-reading', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ reading_id: 'reading-1' }),
      }),
      client as never,
    );

    const { tokens } = await response.json();
    const hui = tokens.filter((token: any) => token.text === '会');
    expect(hui.map((token: any) => token.word.id)).toEqual([30, 30, 31]);
    expect(hui[2].senses.map((sense: any) => sense.id)).toEqual([30, 31]);
  });

  it('si la acepción resuelta no está en words, lo registra y deja la del tokenizador', async () => {
    const reading = queryResult({
      data: { sentences: [{ zh: '会。', senses: [{ hanzi: '会', occurrence: 0, hsk_level: 2, sense_index: 9 }] }] },
      error: null,
    });
    const words = queryResult({
      data: [
        { id: 30, hanzi: '会', sense_index: 1, pinyin: 'huì', meaning_en: 'can', meaning_es: 'saber', hsk_level: 1, pos: 'verb', frequency: 1 },
        { id: 31, hanzi: '会', sense_index: 2, pinyin: 'huì', meaning_en: 'meeting', meaning_es: 'reunión', hsk_level: 3, pos: 'noun', frequency: 1 },
      ],
      error: null,
    });
    const cards = queryResult({ data: [], error: null });
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn((table: string) => (table === 'reading' ? reading : table === 'words' ? words : cards)),
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handleTokenizeReading(
      new Request('https://functions.local/tokenize-reading', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ reading_id: 'reading-1' }),
      }),
      client as never,
    );

    const { tokens } = await response.json();
    expect(tokens[0].word.id).toBe(30);
    expect(error).toHaveBeenCalledWith('Resolved sense missing from words:', expect.objectContaining({ hanzi: '会', sense_index: 9 }));
    error.mockRestore();
  });
});
