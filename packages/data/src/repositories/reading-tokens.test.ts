import { describe, expect, it, vi } from 'vitest';
import { getReading } from './readings';

function readingQuery() {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn().mockResolvedValue({
      data: {
        slug: 'reading-1',
        hsk_level: 2,
        format: 'story',
        title: '你好',
        topic: 'saludos',
        series: null,
        series_index: null,
        sentences: [{ zh: '你好。', pinyin: 'nǐ hǎo', es: 'Hola.' }],
        questions: [{
          prompt: '他说什么？',
          options: ['你好'],
          answer_index: 0,
          evidence_sentence: 0,
        }],
        audio_kind: 'tts',
        audio_url: null,
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
    expect(reading.sentences[0].tokens).toHaveLength(1);
    expect(reading.sentences[0].tokens[0].text).toBe('你好');
    expect(reading.questions).toEqual([{
      id: 'q0',
      prompt: '他说什么？',
      options: [{ id: '0', text: '你好' }],
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

  it('carga los puntos de gramática declarados por la lectura', async () => {
    const reading = readingQuery();
    reading.single = vi.fn().mockResolvedValue({
      data: {
        slug: 'reading-1',
        hsk_level: 2,
        format: 'story',
        title: '你好',
        topic: 'saludos',
        series: null,
        series_index: null,
        sentences: [{ zh: '你好。', pinyin: 'nǐ hǎo', es: 'Hola.' }],
        target_grammar: [{ code: '6.3.4', level: 2 }],
        questions: [],
        audio_kind: 'tts',
        audio_url: null,
      },
      error: null,
    });
    const grammarQuery: Record<string, any> = {
      select: vi.fn(() => grammarQuery),
      in: vi.fn(() => grammarQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: [{ code: '6.3.4', hsk_level: 2, title: '比较句', category: '句子' }],
        error: null,
      }).then(resolve),
    };
    const client = {
      from: vi.fn((table: string) => table === 'grammar_points' ? grammarQuery : reading),
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { tokens: [] }, error: null }),
      },
    };

    const result = await getReading('reading-1', client as never);

    expect(result.grammar_points).toEqual([
      expect.objectContaining({ code: '6.3.4', title: '比较句', category: '句子' }),
    ]);
  });

  it('asigna estado de aprendizaje a cada palabra de la lectura', async () => {
    const reading = readingQuery();
    const skillQuery: Record<string, any> = {
      select: vi.fn(() => skillQuery),
      eq: vi.fn(() => skillQuery),
      in: vi.fn(() => skillQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: [{ target_id: 2, skill: 'recognition', stability: 31 }],
        error: null,
      }).then(resolve),
    };
    const client = {
      from: vi.fn((table: string) => table === 'learner_skill_state' ? skillQuery : reading),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            tokens: [
              { id: 't0', text: '你好', type: 'word', word: { id: 2, hanzi: '你好', in_srs: true } },
              { id: 't2', text: '龘', type: 'unknown', word: null },
            ],
          },
          error: null,
        }),
      },
    };

    const result = await getReading('reading-1', client as never);

    expect(result.sentences[0].tokens[0].status).toBe('known');
    expect(result.sentences[0].tokens[1].status).toBe('unknown');
  });
});
