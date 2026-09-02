import { fireEvent, render } from '@testing-library/react-native';
import type { Exercise } from '@hanyu/data';
import { ExerciseRenderer } from './ExerciseRenderer';

function exercise(prompt: Exercise['prompt']): Exercise {
  const solution: Exercise['solution'] = (() => {
    switch (prompt.kind) {
      case 'fill_blank':
        return { kind: 'fill_blank', accept: prompt.options?.slice(0, 1) ?? [] };
      case 'multiple_choice':
        return { kind: 'multiple_choice', correct: prompt.options[0] ?? '' };
      case 'reorder':
        return { kind: 'reorder', order: prompt.tokens };
      case 'dictation':
        return { kind: 'dictation', hanzi: prompt.audio_text, pinyin: null };
      case 'matching':
        return {
          kind: 'matching',
          pairs: Object.fromEntries(prompt.pairs.map(pair => [pair.left, pair.right])),
        };
    }
  })();

  return {
    id: 'exercise-1',
    type: prompt.kind,
    hsk_level: 2,
    prompt,
    solution,
    explanation: null,
  };
}

describe('ExerciseRenderer', () => {
  it('emits a fill-blank draft', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise({ kind: 'fill_blank', sentence: '我___汉语。' })}
        value=""
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.changeText(view.getByPlaceholderText('Type your answer'), '学习');
    expect(onChange).toHaveBeenLastCalledWith('学习');
  });

  it('selects a multiple-choice answer', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise({
          kind: 'multiple_choice',
          question: 'What does 学习 mean?',
          options: ['to study', 'to sleep'],
        })}
        value={null}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'to study' }));
    expect(onChange).toHaveBeenLastCalledWith('to study');
  });

  it('renders dictation audio and emits typed text', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise({ kind: 'dictation', audio_text: '你好' })}
        value=""
        disabled={false}
        onChange={onChange}
      />,
    );

    expect(view.getByRole('button', { name: 'Play dictation' })).toBeTruthy();
    await fireEvent.changeText(view.getByPlaceholderText('Type what you hear'), '你好');
    expect(onChange).toHaveBeenLastCalledWith('你好');
  });

  it('builds and clears an accessible sentence order', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise({ kind: 'reorder', tokens: ['我', '学习', '中文'] })}
        value={['我']}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Add 学习' }));
    expect(onChange).toHaveBeenLastCalledWith(['我', '学习']);

    await fireEvent.press(view.getByRole('button', { name: 'Clear order' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('matches left and right values without drag-and-drop', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise({
          kind: 'matching',
          pairs: [
            { left: '你', right: 'you' },
            { left: '好', right: 'good' },
          ],
        })}
        value={{}}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Select 你' }));
    await fireEvent.press(view.getByRole('button', { name: 'Match you' }));

    expect(onChange).toHaveBeenLastCalledWith({ 你: 'you' });
  });
});
