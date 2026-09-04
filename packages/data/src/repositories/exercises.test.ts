import { describe, expect, it, vi } from 'vitest';
import { buildExerciseSession, buildMockExam, checkExercise, generateExercise, getMistakes, recordHintUsed } from './exercises';

const user = { id: 'u1' };

function auth() {
  return { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) };
}

function queryChain(result: Record<string, unknown>) {
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'in', 'order', 'limit', 'single', 'maybeSingle',
  ];

  const chain: Record<string, any> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

function clientFor(perTable: Record<string, Record<string, unknown>>) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const invoke = vi.fn().mockResolvedValue({ data: null, error: null });
  const chains: Record<string, any> = {};

  return {
    auth: auth(),
    rpc,
    functions: { invoke },
    from: vi.fn((table: string) => {
      chains[table] = chains[table] ?? queryChain(perTable[table] ?? { data: null, error: null });
      return chains[table];
    }),
    chains,
  } as any;
}

function mistakeClient(rows: unknown[]) {
  const client = clientFor({});
  client.rpc.mockResolvedValue({ data: rows, error: null });
  return client;
}

const matchingRow = {
  id: 'x1',
  type: 'matching',
  hsk_level: 1,
  target_word_id: 4,
  prompt: {
    type: 'matching',
    pairs: [
      { left: '学生', right: 'student' },
      { left: '老师', right: 'teacher' },
    ],
  },
  answer: 'matched',
};

const reorderRow = {
  id: 'x2',
  type: 'reorder',
  hsk_level: 1,
  slug: 'l1-reorder-01',
  unit_code: '4.3',
  target_word_id: 4,
  prompt: {
    type: 'reorder',
    words: ['喝', '我', '茶', '喜欢'],
    correct_order: ['我', '喜欢', '喝', '茶'],
  },
  answer: '我喜欢喝茶',
};

describe('exercises repository', () => {
  it('construye una sesión para la unidad solicitada', async () => {
    const client = clientFor({});
    client.rpc.mockResolvedValue({
      data: {
        unit_code: '2.2.2',
        unit_title: '离合词',
        length: 3,
        exercises: [reorderRow, matchingRow],
      },
      error: null,
    });

    const session = await buildExerciseSession('2.2.2', 3, client);

    expect(client.rpc).toHaveBeenCalledWith('build_exercise_session', {
      p_unit_code: '2.2.2',
      p_length: 3,
    });
    expect(session).toMatchObject({
      unit_code: '2.2.2',
      unit_title: '离合词',
      length: 3,
    });
    expect(session.exercises).toHaveLength(2);
    expect(session.exercises[0].prompt).toEqual({
      kind: 'reorder',
      tokens: ['喝', '我', '茶', '喜欢'],
    });
  });

  it('construye un simulacro por sección sin reprogramar tarjetas', async () => {
    const client = clientFor({});
    client.rpc.mockResolvedValue({
      data: {
        hsk_level: 2,
        scope: 'section',
        sections: [{ code: 'listening', title: '听力', minutes: 25, exercises: [reorderRow] }],
        unsupported: [{ section: '书写', reason: 'no_matching_type' }],
      },
      error: null,
    });

    const exam = await buildMockExam(2, 'section', client);

    expect(client.rpc).toHaveBeenCalledWith('build_mock_exam', {
      p_level: 2,
      p_scope: 'section',
    });
    expect(exam.sections[0]).toMatchObject({ code: 'listening', minutes: 25 });
    expect(exam.sections[0].exercises[0].prompt).toEqual({
      kind: 'reorder',
      tokens: ['喝', '我', '茶', '喜欢'],
    });
    expect(exam.unsupported[0].section).toBe('书写');
  });

  it('checkExercise marca correcto un matching completo y bien emparejado', async () => {
    const client = clientFor({
      generated_exercises: { data: matchingRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    const result = await checkExercise(
      'x1',
      { kind: 'matching', pairs: { 学生: 'student', 老师: 'teacher' } },
      client,
    );

    expect(result.correct).toBe(true);
  });

  it('guarda is_correct y emite el evento que alimenta el cuaderno', async () => {
    const client = clientFor({
      generated_exercises: { data: matchingRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    await checkExercise(
      'x1',
      { kind: 'matching', pairs: { 学生: 'student', 老师: 'teacher' } },
      client,
    );

    expect(client.chains.exercise_attempts.insert).toHaveBeenCalledWith(expect.objectContaining({
      is_correct: true,
    }));
    expect(client.chains.learning_event.insert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'exercise_attempted',
      target_kind: 'word',
      target_id: 4,
      payload: expect.objectContaining({ correct: true }),
    }));
  });

  it('cuenta una respuesta con pista como no consolidada', async () => {
    const client = clientFor({
      generated_exercises: { data: matchingRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    const result = await checkExercise(
      'x1',
      { kind: 'matching', pairs: { 学生: 'student', 老师: 'teacher' } },
      client,
      { hintUsed: true },
    );

    expect(result).toMatchObject({ correct: false, answer_correct: true, hint_used: true });
    expect(client.chains.exercise_attempts.insert).toHaveBeenCalledWith(expect.objectContaining({
      is_correct: false,
      feedback: { hint_used: true },
    }));
  });

  it('checkExercise marca correcto un reorder bien ordenado', async () => {
    const client = clientFor({
      generated_exercises: { data: reorderRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    const result = await checkExercise(
      'x2',
      { kind: 'reorder', tokens: ['我', '喜欢', '喝', '茶'] },
      client,
    );

    expect(result.correct).toBe(true);
  });

  it('checkExercise dice qué pares fallaron', async () => {
    const client = clientFor({
      generated_exercises: { data: matchingRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    const result = await checkExercise(
      'x1',
      { kind: 'matching', pairs: { 学生: 'teacher', 老师: 'teacher' } },
      client,
    );

    expect(result.correct).toBe(false);
    expect(result.detail).toEqual({
      kind: 'matching',
      wrong: ['学生'],
      missing: [],
      wrong_pairs: ['学生'],
    });
  });

  it('checkExercise no llama a ninguna RPC ni Edge Function', async () => {
    const client = clientFor({
      generated_exercises: { data: reorderRow, error: null },
      exercise_attempts: { data: null, error: null },
      user_stats: { data: null, error: null },
    });

    await checkExercise('x2', { kind: 'reorder', tokens: ['我'] }, client);

    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it('generateExercise devuelve la solución en un campo declarado y sin campos sueltos', async () => {
    const client = clientFor({ generated_exercises: { data: [reorderRow], error: null } });
    client.functions.invoke = vi.fn().mockResolvedValue({ data: null, error: new Error('no') });

    const exercise = await generateExercise('reorder', 1, client);

    expect(exercise.solution).toEqual({
      kind: 'reorder',
      order: ['我', '喜欢', '喝', '茶'],
    });
    expect(Object.keys(exercise).sort()).toEqual(
      ['explanation', 'hsk_level', 'id', 'prompt', 'solution', 'slug', 'target_word_id', 'type', 'unit_code'].sort(),
    );
    expect(exercise.slug).toBe('l1-reorder-01');
    expect(exercise.unit_code).toBe('4.3');
  });

  it('mete en la cola lo fallado', async () => {
    const client = mistakeClient([{ target_id: 42, hanzi: '茶', pinyin: 'chá', meaning_es: 'té', misses: 1, hits_since: 0 }]);

    expect(await getMistakes(client)).toMatchObject([{
      target_id: 42,
      word: { hanzi: '茶', meaning_es: 'té' },
    }]);
  });

  it('confía en la decisión de salida calculada por SQL', async () => {
    const client = mistakeClient([{ target_id: 42, misses: 1, hits_since: 2, distinct_days: 2 }]);

    expect(await getMistakes(client)).toHaveLength(1);
  });

  it('no duplica la decisión de salida en el cliente', async () => {
    const client = mistakeClient([{ target_id: 42, misses: 1, hits_since: 2, distinct_days: 1 }]);

    expect(await getMistakes(client)).toHaveLength(1);
  });

  it('registra el uso de la pista con la palabra objetivo', async () => {
    const client = clientFor({
      generated_exercises: { data: { target_word_id: 4 }, error: null },
      learning_event: { data: null, error: null },
    });

    await recordHintUsed('x1', client);

    expect(client.chains.learning_event.insert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'hint_used',
      target_kind: 'word',
      target_id: 4,
    }));
  });
});
