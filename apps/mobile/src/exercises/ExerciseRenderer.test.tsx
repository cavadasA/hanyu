import { fireEvent, render } from '@testing-library/react-native';
import type { Exercise } from '@hanyu/data';
import { ExerciseRenderer } from './ExerciseRenderer';

function exercise(prompt: Exercise['prompt'], solution: Exercise['solution']): Exercise {
  return {
    id: 'exercise-1',
    type: prompt.kind,
    hsk_level: 2,
    prompt,
    solution,
    explanation: null,
  };
}

const MATCHING_PAIRS = [
  { left: '学生', right: 'student' },
  { left: '老师', right: 'teacher' },
  { left: '朋友', right: 'friend' },
  { left: '医生', right: 'doctor' },
];

function matchingExercise() {
  return exercise(
    { kind: 'matching', pairs: MATCHING_PAIRS },
    {
      kind: 'matching',
      pairs: { 学生: 'student', 老师: 'teacher', 朋友: 'friend', 医生: 'doctor' },
    },
  );
}

describe('ExerciseRenderer', () => {
  it('emits a fill-blank draft', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise(
          { kind: 'fill_blank', sentence: '我___汉语。' },
          { kind: 'fill_blank', accept: ['学习'] },
        )}
        value={{ kind: 'fill_blank', text: '' }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.changeText(view.getByPlaceholderText('Escribe tu respuesta'), '学习');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'fill_blank', text: '学习' });
  });

  it('emits a multiple-choice draft', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise(
          {
            kind: 'multiple_choice',
            question: 'What does 学习 mean?',
            options: ['to study', 'to sleep'],
          },
          { kind: 'multiple_choice', correct: 'to study' },
        )}
        value={{ kind: 'multiple_choice', option: '' }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'to study' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'multiple_choice', option: 'to study' });
  });

  it('renders dictation audio and emits typed text', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise(
          { kind: 'dictation', audio_text: '你好' },
          { kind: 'dictation', hanzi: '你好', pinyin: null },
        )}
        value={{ kind: 'dictation', text: '' }}
        disabled={false}
        onChange={onChange}
      />,
    );

    expect(view.getByRole('button', { name: 'Reproducir el dictado' })).toBeTruthy();
    await fireEvent.changeText(view.getByPlaceholderText('Escribe lo que oyes'), '你好');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'dictation', text: '你好' });
  });

  it('reorder emits a typed answer with the pieces in order', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={exercise(
          { kind: 'reorder', tokens: ['喝', '我', '茶', '喜欢'] },
          { kind: 'reorder', order: ['我', '喜欢', '喝', '茶'] },
        )}
        value={{ kind: 'reorder', tokens: [] }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Añadir 我' }));

    expect(onChange).toHaveBeenLastCalledWith({ kind: 'reorder', tokens: ['我'] });
  });

  it('matching emits the chosen pair inside the map', async () => {
    const onChange = jest.fn();
    const view = await render(
      <ExerciseRenderer
        exercise={matchingExercise()}
        value={{ kind: 'matching', pairs: {} }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Elegir 学生' }));
    await fireEvent.press(view.getByRole('button', { name: 'Emparejar con student' }));

    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'matching',
      pairs: { 学生: 'student' },
    });
  });

  it('matching does not line the right column up with the left one', async () => {
    // Con las dos columnas en el mismo orden, el ejercicio se resuelve por
    // posición sin leer nada.
    const view = await render(
      <ExerciseRenderer
        exercise={matchingExercise()}
        value={{ kind: 'matching', pairs: {} }}
        disabled={false}
        onChange={jest.fn()}
      />,
    );

    const rendered = view
      .getAllByRole('button')
      .map((node) => String(node.props.accessibilityLabel ?? ''))
      .filter((label) => label.startsWith('Emparejar con '))
      .map((label) => label.slice('Emparejar con '.length));

    const original = MATCHING_PAIRS.map((pair) => pair.right);

    expect(rendered).toHaveLength(4);
    expect(rendered).not.toEqual(original);
    expect(rendered.every((right, index) => right !== original[index])).toBe(true);
    expect([...rendered].sort()).toEqual([...original].sort());
  });
});
