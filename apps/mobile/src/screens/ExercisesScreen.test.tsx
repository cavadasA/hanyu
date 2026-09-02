import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ExercisesScreen } from './ExercisesScreen';

const mockGenerateExercise = jest.fn();
const mockCheckExercise = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    exercises: {
      generateExercise: (...args: unknown[]) => mockGenerateExercise(...args),
      checkExercise: (...args: unknown[]) => mockCheckExercise(...args),
    },
  }),
}));

describe('ExercisesScreen', () => {
  beforeEach(() => {
    mockGenerateExercise.mockReset();
    mockCheckExercise.mockReset();
  });

  it('completes a dictation and shows its explanation', async () => {
    mockGenerateExercise.mockResolvedValue({
      id: 'exercise-1',
      type: 'dictation',
      hsk_level: 2,
      prompt: { kind: 'dictation', audio_text: '你好' },
      solution: { kind: 'dictation', hanzi: '你好', pinyin: null },
      explanation: 'Listen for both syllables.',
    });
    mockCheckExercise.mockResolvedValue({
      correct: true,
      expected_answer: { kind: 'dictation', hanzi: '你好', pinyin: null },
      submitted_answer: { kind: 'dictation', text: '你好' },
      detail: { kind: 'simple' },
      explanation: 'Correct greeting.',
    });
    const view = await render(<ExercisesScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Dictation' }));
    await fireEvent.press(view.getByRole('button', { name: 'Generate exercise' }));

    await waitFor(() => expect(view.getByRole('button', { name: 'Play dictation' })).toBeTruthy());
    expect(view.getByRole('button', { name: 'Check answer' }).props.accessibilityState)
      .toMatchObject({ disabled: true });

    await fireEvent.changeText(view.getByPlaceholderText('Type what you hear'), '你好');
    await fireEvent.press(view.getByRole('button', { name: 'Check answer' }));

    await waitFor(() => expect(view.getByText('Correct')).toBeTruthy());
    expect(view.getByText('Correct greeting.')).toBeTruthy();
    expect(mockGenerateExercise).toHaveBeenCalledWith('dictation', 2);
    expect(mockCheckExercise).toHaveBeenCalledWith('exercise-1', {
      kind: 'dictation',
      text: '你好',
    });
  });

  const MATCHING = {
    id: 'exercise-2',
    type: 'matching' as const,
    hsk_level: 2 as const,
    prompt: {
      kind: 'matching' as const,
      pairs: [
        { left: '学生', right: 'student' },
        { left: '老师', right: 'teacher' },
        { left: '朋友', right: 'friend' },
        { left: '医生', right: 'doctor' },
      ],
    },
    solution: {
      kind: 'matching' as const,
      pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend', 医生: 'doctor' },
    },
    explanation: null,
  };

  it('will not let a half-finished matching be checked', async () => {
    mockGenerateExercise.mockResolvedValue(MATCHING);
    const view = await render(<ExercisesScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Matching' }));
    await fireEvent.press(view.getByRole('button', { name: 'Generate exercise' }));
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Select 学生' })).toBeTruthy(),
    );

    await fireEvent.press(view.getByRole('button', { name: 'Select 学生' }));
    await fireEvent.press(view.getByRole('button', { name: 'Match student' }));

    // Un par de cuatro no es una respuesta.
    expect(view.getByRole('button', { name: 'Check answer' }).props.accessibilityState)
      .toMatchObject({ disabled: true });
  });

  it('says which pairs were wrong', async () => {
    mockGenerateExercise.mockResolvedValue(MATCHING);
    mockCheckExercise.mockResolvedValue({
      correct: false,
      expected_answer: MATCHING.solution,
      submitted_answer: { kind: 'matching', pairs: {} },
      detail: { kind: 'matching', wrong: ['学生'], missing: [] },
      explanation: null,
    });
    const view = await render(<ExercisesScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Matching' }));
    await fireEvent.press(view.getByRole('button', { name: 'Generate exercise' }));
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Select 学生' })).toBeTruthy(),
    );

    for (const [left, right] of [
      ['学生', 'teacher'],
      ['老师', 'student'],
      ['朋友', 'friend'],
      ['医生', 'doctor'],
    ]) {
      await fireEvent.press(view.getByRole('button', { name: `Select ${left}` }));
      await fireEvent.press(view.getByRole('button', { name: `Match ${right}` }));
    }

    await fireEvent.press(view.getByRole('button', { name: 'Check answer' }));

    await waitFor(() => expect(view.getByText('Wrong: 学生')).toBeTruthy());
  });
});
