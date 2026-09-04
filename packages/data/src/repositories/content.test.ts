import { describe, expect, it, vi } from 'vitest';
import { generateExercise } from './exercises';
import { getGrammar, getGrammarStudyState, markGrammarStudied } from './grammar';
import { getReadings } from './readings';
import { getWords } from './words';

function queryResult(result: Record<string, unknown>) {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    limit: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

describe('mobile content repository contracts', () => {
  it('returns a stable paginated word page', async () => {
    const count = queryResult({ count: 41, error: null });
    const rows = queryResult({
      data: [
        {
          id: 7,
          hanzi: '学习',
          pinyin: 'xuéxí',
          meaning_en: 'to study',
          meaning_es: null,
          hsk_level: 2,
          pos: 'verb',
          frequency: 10,
        },
      ],
      error: null,
    });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(count)
        .mockReturnValueOnce(rows),
    };

    const result = await getWords(
      { search: 'xue', level: 2, page: 2, page_size: 20 },
      client as never,
    );

    expect(result).toMatchObject({
      items: [
        {
          id: 7,
          hanzi: '学习',
          pinyin: 'xuéxí',
          meaning_en: 'to study',
          meaning_es: null,
          hsk_level: 2,
          pos: 'verb',
          frequency: 10,
          in_srs: false,
        },
      ],
      page: 2,
      page_size: 20,
      total: 41,
    });
    expect(rows.range).toHaveBeenCalledWith(20, 39);
  });

  it('normalizes a generated dictation into a discriminated prompt', async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            id: 'exercise-1',
            type: 'dictation',
            hsk_level: 2,
            audio_text: '你好',
            pinyin: 'nǐ hǎo',
            accept_pinyin: true,
            explanation: 'A greeting.',
          },
          error: null,
        }),
      },
    };

    await expect(generateExercise('dictation', 2, client as never)).resolves.toMatchObject({
      id: 'exercise-1',
      type: 'dictation',
      hsk_level: 2,
      prompt: {
        kind: 'dictation',
        audio_text: '你好',
        pinyin: 'nǐ hǎo',
        accept_pinyin: true,
      },
      explanation: 'A greeting.',
    });
  });

  it('normalizes reading summaries without leaking created_at', async () => {
    const rows = queryResult({
      data: [{
        slug: 'reading-1',
        hsk_level: 2,
        format: 'story',
        title: 'A day',
        topic: 'vida diaria',
        series: null,
        series_index: null,
        sentences: [],
        questions: [],
        audio_kind: 'tts',
        audio_url: null,
      }],
      error: null,
    });
    const client = { from: vi.fn(() => rows) };

    await expect(getReadings({ level: 2, format: 'story' }, client as never)).resolves.toMatchObject({
      0: {
        id: 'reading-1',
        slug: 'reading-1',
        hsk_level: 2,
        format: 'story',
        title: 'A day',
        topic: 'vida diaria',
        audio_kind: 'tts',
      },
    });
  });

  it('normalizes grammar examples and supplies a nullable pattern', async () => {
    const rows = queryResult({
      data: [{
        id: 3,
        hsk_level: 2,
        title: '因为…所以…',
        explanation: 'Cause and result.',
        examples: '[{"chinese":"因为下雨，所以我不去。","english":"Because it rains, I am not going."}]',
        order_idx: 1,
      }],
      error: null,
    });
    const client = { from: vi.fn(() => rows) };

    await expect(getGrammar(2, client as never)).resolves.toMatchObject([{
      id: 3,
      hsk_level: 2,
      title: '因为…所以…',
      pattern: null,
      explanation: 'Cause and result.',
      examples: [{
        chinese: '因为下雨，所以我不去。',
        english: 'Because it rains, I am not going.',
      }],
    }]);
  });

  it('marca un punto de gramática como estudiado', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };

    await expect(markGrammarStudied(42, client as never)).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith('mark_grammar_studied', { p_grammar_id: 42 });
  });

  it('recupera el estado persistido de estudio de un punto de gramática', async () => {
    const rows = queryResult({ data: { fsrs_state: 'review', suspended: false }, error: null });
    const client = { from: vi.fn(() => rows) };

    await expect(getGrammarStudyState(42, client as never)).resolves.toBe(true);
    expect(client.from).toHaveBeenCalledWith('learner_skill_state');
    expect(rows.eq).toHaveBeenCalledWith('target_id', 42);
  });
});
