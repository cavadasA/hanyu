import { describe, expect, it, vi } from 'vitest';
import { assessPronunciation, getCommunicativeContext, getCommunicativeTasks, getWritingQueue, gradeCommunicative, reviewWriting } from './expression';

/** supabase-js: una respuesta no 2xx llega como error con la Response en `context`. */
function httpError(status: number, body: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify(body), { status }),
  });
}

function client(result: { data?: unknown; error?: unknown }) {
  return { functions: { invoke: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })) } } as any;
}

const ASSESSMENT = {
  accuracy: 88,
  fluency: 90,
  completeness: 100,
  syllables: [{ syllable: '你', accuracy: 92 }, { syllable: '好', accuracy: 84 }],
};

describe('assessPronunciation', () => {
  it('200 → puntuación por sílaba', async () => {
    const fake = client({ data: ASSESSMENT });

    const outcome = await assessPronunciation({ audio_base64: 'UklGRg==', reference_text: '你好' }, fake);

    expect(fake.functions.invoke).toHaveBeenCalledWith('pronunciation-assess', {
      body: { audio_base64: 'UklGRg==', reference_text: '你好' },
    });
    expect(outcome).toEqual({ status: 'scored', assessment: ASSESSMENT });
  });

  it('503 not_configured → no disponible', async () => {
    const outcome = await assessPronunciation(
      { audio_base64: 'x', reference_text: '你好' },
      client({ error: httpError(503, { reason: 'not_configured' }) }),
    );

    expect(outcome).toEqual({ status: 'unavailable', reason: 'not_configured' });
  });

  it('sin red o con otra respuesta → no disponible, nunca una nota inventada', async () => {
    const offline = await assessPronunciation(
      { audio_base64: 'x', reference_text: '你好' },
      client({ error: Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError' }) }),
    );
    const odd = await assessPronunciation({ audio_base64: 'x', reference_text: '你好' }, client({ data: { accuracy: 'alta' } }));

    expect(offline.status).toBe('unavailable');
    expect(odd.status).toBe('unavailable');
  });
});

describe('gradeCommunicative', () => {
  it('graded → con aprobado, intenciones y devolución', async () => {
    const graded = { status: 'graded', passed: false, intents: [true, false], feedback_es: 'Falta el motivo.' };

    const outcome = await gradeCommunicative({ task_slug: '2-03-x', answer: '我不去。' }, client({ data: graded }));

    expect(outcome).toEqual(graded);
  });

  it('ungraded → sin corregir', async () => {
    const outcome = await gradeCommunicative({ task_slug: '2-03-x', answer: '我不去。' }, client({ data: { status: 'ungraded' } }));

    expect(outcome).toEqual({ status: 'ungraded' });
  });

  it('422 → rechazada con sus motivos', async () => {
    const outcome = await gradeCommunicative(
      { task_slug: '2-03-x', answer: 'wo bu qu' },
      client({ error: httpError(422, { status: 'rejected', reasons: ['not_chinese'] }) }),
    );

    expect(outcome).toEqual({ status: 'rejected', reasons: ['not_chinese'] });
  });

  it('503 o sin red → no disponible', async () => {
    const unconfigured = await gradeCommunicative(
      { task_slug: '2-03-x', answer: '我不去。' },
      client({ error: httpError(503, { reason: 'not_configured' }) }),
    );
    const offline = await gradeCommunicative(
      { task_slug: '2-03-x', answer: '我不去。' },
      client({ error: new Error('Failed to fetch') }),
    );

    expect(unconfigured).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(offline).toEqual({ status: 'unavailable', reason: 'network' });
  });
});

describe('tareas comunicativas y su contexto', () => {
  /** Cliente falso de PostgREST: devuelve filas por tabla y respeta range(). */
  function tables(rows: Record<string, any[]>) {
    const calls: Array<{ table: string; filters: unknown[] }> = [];
    return {
      calls,
      from(table: string) {
        const filters: unknown[] = [];
        calls.push({ table, filters });
        let slice: [number, number] | null = null;
        const query: any = {
          select: () => query,
          lte: (column: string, value: number) => (filters.push(['lte', column, value]), query),
          order: () => query,
          range: (from: number, to: number) => ((slice = [from, to]), query),
          then: (resolve: any) => {
            const all = (rows[table] ?? []).filter(row =>
              filters.every(([, column, value]: any) => row[column] <= value));
            resolve({ data: slice ? all.slice(slice[0], slice[1] + 1) : all, error: null });
          },
        };
        return query;
      },
    } as any;
  }

  it('el contexto trae el diccionario hasta el nivel, con variantes, paginado, y los marcadores', async () => {
    const words: Array<{ hanzi: string; hsk_level: number; variants: string[] }> = Array.from({ length: 1500 }, (_, index) => ({ hanzi: `词${index}`, hsk_level: index < 1400 ? 1 : 3, variants: [] }));
    words[0] = { hanzi: '有时候', hsk_level: 2, variants: ['有时'] };
    const fake = tables({
      words,
      grammar_points: [
        { hsk_level: 2, code: '6.4.3', markers: ['因为', '所以'] },
        { hsk_level: 3, code: '1.1.1', markers: ['把'] },
      ],
    });

    const ctx = await getCommunicativeContext(2, fake);

    expect(ctx.dictionary).toHaveLength(1401);
    expect(ctx.dictionary).toContainEqual({ hanzi: '有时', hsk_level: 2 });
    expect(ctx.grammar_points).toEqual([{ hsk_level: 2, code: '6.4.3', markers: ['因为', '所以'] }]);
  });

  it('las tareas hasta el nivel', async () => {
    const task = (slug: string, hsk_level: number) => ({ slug, hsk_level, mode: 'write', intent: ['x'], required_markers: [], min_chars: 1, max_chars: 9, situation_es: 's', model_answer: { zh: '我', pinyin: 'wǒ', es: 'yo' } });
    const fake = tables({ communicative_task: [task('2-01-a', 2), task('3-01-b', 3)] });

    const tasks = await getCommunicativeTasks(2, fake);

    expect(tasks.map(entry => entry.slug)).toEqual(['2-01-a']);
  });
});

describe('escritura en la cola', () => {
  const NOW = new Date('2026-11-26T10:00:00Z');

  function rpcClient(responses: Record<string, unknown>) {
    const rpc = vi.fn(async (name: string) => ({ data: responses[name] ?? null, error: null }));
    const settings = {
      select: () => settings,
      eq: () => settings,
      maybeSingle: async () => ({ data: { request_retention: 0.9 }, error: null }),
      single: async () => ({ data: { request_retention: 0.9 }, error: null }),
    };
    return {
      rpc,
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }), getSession: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }) },
      from: () => settings,
    } as any;
  }

  it('la cola trae vencidos con su estado y nuevos con estado vacío', async () => {
    const fake = rpcClient({
      build_writing_queue: [
        { hanzi: '学', target_id: 23398, is_new: false, difficulty: 5, stability: 3, reps: 2, lapses: 0, learning_steps: 0, scheduled_days: 3, elapsed_days: 3, fsrs_state: 'review', next_review_at: '2026-11-25T00:00:00Z', last_reviewed_at: '2026-11-22T00:00:00Z', version: 4, example_word: '学生', example_pinyin: 'xuéshēng', example_meaning: 'estudiante' },
        { hanzi: '生', target_id: 29983, is_new: true, difficulty: null, stability: null, reps: 0, lapses: 0, learning_steps: 0, scheduled_days: 0, elapsed_days: 0, fsrs_state: 'new', next_review_at: null, last_reviewed_at: null, version: 0 },
      ],
    });

    const queue = await getWritingQueue({ limit: 10, newLimit: 3, now: NOW }, fake);

    expect(fake.rpc).toHaveBeenCalledWith('build_writing_queue', { p_limit: 10, p_new: 3 });
    expect(queue.map(item => [item.hanzi, item.is_new, item.version, item.scheduling.state])).toEqual([
      ['学', false, 4, 'review'],
      ['生', true, 0, 'new'],
    ]);
    expect(queue[0].scheduling.stability).toBe(3);
    expect(queue[0].example).toEqual({ word: '学生', pinyin: 'xuéshēng', meaning: 'estudiante' });
    expect(queue[1].example).toBeNull();
  });

  it('un repaso manda el estado FSRS calculado, la nota, los errores y la versión esperada', async () => {
    const fake = rpcClient({ apply_skill_review: [{ outcome: 'applied', version: 5 }] });
    const [item] = await getWritingQueue({ limit: 10, newLimit: 3, now: NOW }, rpcClient({
      build_writing_queue: [{ hanzi: '学', target_id: 23398, is_new: false, difficulty: 5, stability: 3, reps: 2, lapses: 0, learning_steps: 0, scheduled_days: 3, elapsed_days: 3, fsrs_state: 'review', next_review_at: '2026-11-25T00:00:00Z', last_reviewed_at: '2026-11-22T00:00:00Z', version: 4 }],
    }));

    const result = await reviewWriting({ item, grade: 'hard', mistakes: 1, hints: 0, review_id: 'rev-1', now: NOW }, fake);

    expect(result).toEqual({ outcome: 'applied', version: 5 });
    const [name, args] = fake.rpc.mock.calls.at(-1) as [string, any];
    expect(name).toBe('apply_skill_review');
    expect(args).toMatchObject({
      p_target_kind: 'character',
      p_target_id: 23398,
      p_skill: 'writing',
      p_review_id: 'rev-1',
      p_expected_version: 4,
      p_grade: 2,
      p_payload: { mistakes: 1, hints: 0, hanzi: '学' },
    });
    expect(args.p_prior.state).toBe('review');
    expect(new Date(args.p_state.due).getTime()).toBeGreaterThan(NOW.getTime());
  });
});
