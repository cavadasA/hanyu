import { describe, expect, it, vi } from 'vitest';
import { getReading } from './readings';

function readingQuery() {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'reading-1',
        hsk_level: 2,
        format: 'story',
        title: '你好',
        content: '你好。',
        pinyin_text: 'nǐ hǎo',
        questions: [{
          id: 'q0',
          question: '他说什么？',
          options: [{ id: 'A', text: '你好' }],
        }],
        source_model: 'fallback',
        created_at: '2026-07-30T08:00:00.000Z',
      },
      error: null,
    }),
  };
  return query;
}

describe('reading tokens repository integration', () => {
  it('loads display-ready tokens and normalizes question prompts', async () => {
    const client = {
      from: vi.fn(() => readingQuery()),
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            tokens: [{
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
            }],
          },
          error: null,
        }),
      },
    };

    const reading = await getReading('reading-1', client as never);

    expect(client.functions.invoke).toHaveBeenCalledWith('tokenize-reading', {
      body: { reading_id: 'reading-1' },
    });
    expect(reading.tokens).toHaveLength(1);
    expect(reading.questions).toEqual([{
      id: 'q0',
      prompt: '他说什么？',
      options: [{ id: 'A', text: '你好' }],
    }]);
  });

  it('reports tokenization failures instead of showing a character-level lie', async () => {
    const client = {
      from: vi.fn(() => readingQuery()),
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'function unavailable' },
        }),
      },
    };

    await expect(getReading('reading-1', client as never)).rejects.toMatchObject({
      message: 'Failed to prepare reading words',
    });
  });
});
