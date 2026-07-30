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
      explanation: 'Listen for both syllables.',
    });
    mockCheckExercise.mockResolvedValue({
      correct: true,
      expected_answer: '你好',
      submitted_answer: '你好',
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
    expect(mockCheckExercise).toHaveBeenCalledWith('exercise-1', '你好');
  });
});
