import { act, renderHook } from '@testing-library/react-native';
import type { Exercise, ExerciseCheckResult } from '@hanyu/data';
import { useExerciseSession } from './useExerciseSession';

const exercise: Exercise = {
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
};

describe('useExerciseSession', () => {
  it('loads, checks once, and advances to the next exercise', async () => {
    const nextExercise = { ...exercise, id: 'exercise-2' };
    const api = {
      generateExercise: jest.fn()
        .mockResolvedValueOnce(exercise)
        .mockResolvedValueOnce(nextExercise),
      checkExercise: jest.fn().mockResolvedValue({
        correct: true,
        expected_answer: '你好',
        submitted_answer: '你好',
        explanation: 'Correct.',
      } satisfies ExerciseCheckResult),
    };
    const hook = await renderHook(() => useExerciseSession(api));

    await act(async () => {
      await hook.result.current.load();
    });
    expect(hook.result.current.status).toBe('answering');
    expect(hook.result.current.exercise?.id).toBe('exercise-1');

    await act(async () => {
      hook.result.current.setDraft('你好');
    });
    await act(async () => {
      await Promise.all([
        hook.result.current.check(),
        hook.result.current.check(),
      ]);
    });

    expect(api.checkExercise).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe('checked');
    expect(hook.result.current.result?.correct).toBe(true);

    await act(async () => {
      await hook.result.current.next();
    });
    expect(hook.result.current.exercise?.id).toBe('exercise-2');
    expect(hook.result.current.draft).toBeNull();
  });

  it('preserves the draft and selection when checking fails', async () => {
    const api = {
      generateExercise: jest.fn().mockResolvedValue(exercise),
      checkExercise: jest.fn().mockRejectedValue(new Error('No connection')),
    };
    const hook = await renderHook(() => useExerciseSession(api));

    await act(async () => {
      hook.result.current.setLevel(3);
      hook.result.current.setType('dictation');
      await hook.result.current.load();
      hook.result.current.setDraft('nǐ hǎo');
    });
    await act(async () => {
      await hook.result.current.check();
    });

    expect(hook.result.current.status).toBe('answering');
    expect(hook.result.current.level).toBe(3);
    expect(hook.result.current.type).toBe('dictation');
    expect(hook.result.current.draft).toBe('nǐ hǎo');
    expect(hook.result.current.error).toBe('No connection');
  });
});
