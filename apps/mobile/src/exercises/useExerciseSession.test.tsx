import { act, renderHook } from '@testing-library/react-native';
import { useExerciseSession } from './useExerciseSession';

const exercise = {
  id: 'exercise-1',
  type: 'multiple_choice',
  hsk_level: 2,
  prompt: { kind: 'multiple_choice', question: '选择', options: ['A', 'B'] },
  solution: { kind: 'multiple_choice', correct: 'A' },
  explanation: 'La opción A encaja con el contexto.',
};

describe('useExerciseSession', () => {
  it('carga una unidad, inicia la sesión y avanza hasta el resumen', async () => {
    const api = {
      buildExerciseSession: jest.fn().mockResolvedValue({
        unit_code: '2.2.2',
        unit_title: '离合词',
        exercises: [exercise],
        length: 1,
      }),
      checkExercise: jest.fn().mockResolvedValue({
        correct: true,
        expected_answer: exercise.solution,
        submitted_answer: { kind: 'multiple_choice', option: 'A' },
        detail: { kind: 'simple' },
        explanation: exercise.explanation,
      }),
    };
    const hook = await renderHook(() => useExerciseSession(api));

    await act(async () => {
      await hook.result.current.load();
    });
    expect(api.buildExerciseSession).toHaveBeenCalledWith(null, 8, []);
    expect(hook.result.current.status).toBe('ready');
    expect(hook.result.current.unit?.unit_title).toBe('离合词');

    await act(async () => {
      hook.result.current.start();
    });
    expect(hook.result.current.status).toBe('answering');
    expect(hook.result.current.progress).toBe('1/1');

    await act(async () => {
      hook.result.current.setDraft({ kind: 'multiple_choice', option: 'A' });
    });
    await act(async () => {
      await hook.result.current.check();
    });
    expect(api.checkExercise).toHaveBeenCalledWith(
      'exercise-1',
      { kind: 'multiple_choice', option: 'A' },
      { hintUsed: false },
    );

    await act(async () => {
      await hook.result.current.next();
    });
    expect(hook.result.current.status).toBe('complete');
    expect(hook.result.current.summary?.correct).toBe(1);
  });

  it('elimina slugs repetidos antes de iniciar la sesión', async () => {
    const api = {
      buildExerciseSession: jest.fn().mockResolvedValue({
        unit_code: '2.2.2',
        unit_title: '离合词',
        exercises: [exercise, exercise],
        length: 2,
      }),
      checkExercise: jest.fn(),
    };
    const hook = await renderHook(() => useExerciseSession(api));

    await act(async () => {
      await hook.result.current.load();
      hook.result.current.start();
    });

    expect(hook.result.current.exercises).toHaveLength(1);
    expect(hook.result.current.progress).toBe('1/1');
  });

  it('carga el cuaderno por palabras objetivo, no por un id de ejercicio inventado', async () => {
    const api = {
      buildExerciseSession: jest.fn().mockResolvedValue({
        unit_code: null,
        unit_title: 'Cuaderno de errores',
        hsk_level: 2,
        exercises: [exercise],
        length: 1,
      }),
      checkExercise: jest.fn(),
    };
    const hook = await renderHook(() => useExerciseSession(api));

    await act(async () => {
      await hook.result.current.load([42]);
    });

    expect(api.buildExerciseSession).toHaveBeenCalledWith(null, 8, [42]);
    expect(hook.result.current.unit?.unit_title).toBe('Cuaderno de errores');
  });

  it('muestra el error de carga sin perder la unidad anterior', async () => {
    const api = {
      buildExerciseSession: jest
        .fn()
        .mockResolvedValueOnce({ unit_code: '2.2.2', unit_title: '离合词', exercises: [exercise], length: 1 })
        .mockRejectedValueOnce(new Error('No connection')),
      checkExercise: jest.fn(),
    };
    const hook = await renderHook(() => useExerciseSession(api));

    await act(async () => {
      await hook.result.current.load();
      await hook.result.current.load();
    });

    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.unit?.unit_title).toBe('离合词');
    expect(hook.result.current.error).toBe('No connection');
  });
});
