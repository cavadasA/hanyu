import { describe, expect, it, vi } from 'vitest';
import { buildExerciseSession, checkExercise, generateExercise } from './exercises';

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

const matchingRow = {
  id: 'x1',
  type: 'matching',
  hsk_level: 1,
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
    expect(result.detail).toEqual({ kind: 'matching', wrong: ['学生'], missing: [] });
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
      ['explanation', 'hsk_level', 'id', 'prompt', 'solution', 'type'].sort(),
    );
  });
});
