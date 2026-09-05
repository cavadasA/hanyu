import { fireEvent, render } from '@testing-library/react-native';
import { MatchingExercise } from './MatchingExercise';

const prompt = {
  kind: 'matching' as const,
  pairs: [
    { left: '学生', right: 'student' },
    { left: '老师', right: 'teacher' },
    { left: '医生', right: 'doctor' },
  ],
};

describe('MatchingExercise', () => {
  it('pairs left then right and emits onChange with the pair', async () => {
    const onChange = jest.fn();
    const view = await render(
      <MatchingExercise
        prompt={prompt}
        value={{ kind: 'matching', pairs: {} }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Select 学生' }));
    await fireEvent.press(view.getByRole('button', { name: 'Match student' }));

    expect(onChange).toHaveBeenCalledWith({
      kind: 'matching',
      pairs: { 学生: 'student' },
    });
  });

  it('pairs right then left (bidirectional selection)', async () => {
    const onChange = jest.fn();
    const view = await render(
      <MatchingExercise
        prompt={prompt}
        value={{ kind: 'matching', pairs: {} }}
        disabled={false}
        onChange={onChange}
      />,
    );

    // Press right column first
    await fireEvent.press(view.getByRole('button', { name: 'Match student' }));
    // Then press left column
    await fireEvent.press(view.getByRole('button', { name: 'Select 学生' }));

    expect(onChange).toHaveBeenCalledWith({
      kind: 'matching',
      pairs: { 学生: 'student' },
    });
  });

  it('deselects an item when tapped twice', async () => {
    const onChange = jest.fn();
    const view = await render(
      <MatchingExercise
        prompt={prompt}
        value={{ kind: 'matching', pairs: {} }}
        disabled={false}
        onChange={onChange}
      />,
    );

    const btn = view.getByRole('button', { name: 'Select 学生' });
    await fireEvent.press(btn);
    expect(btn.props.accessibilityState.selected).toBe(true);

    await fireEvent.press(btn);
    expect(btn.props.accessibilityState.selected).toBe(false);
  });

  it('switches selection when clicking another item in the same column', async () => {
    const view = await render(
      <MatchingExercise
        prompt={prompt}
        value={{ kind: 'matching', pairs: {} }}
        disabled={false}
        onChange={jest.fn()}
      />,
    );

    const btn1 = view.getByRole('button', { name: 'Select 学生' });
    const btn2 = view.getByRole('button', { name: 'Select 老师' });

    await fireEvent.press(btn1);
    expect(btn1.props.accessibilityState.selected).toBe(true);
    expect(btn2.props.accessibilityState.selected).toBe(false);

    await fireEvent.press(btn2);
    expect(btn1.props.accessibilityState.selected).toBe(false);
    expect(btn2.props.accessibilityState.selected).toBe(true);
  });

  it('unpairs an already matched item when tapped', async () => {
    const onChange = jest.fn();
    const view = await render(
      <MatchingExercise
        prompt={prompt}
        value={{ kind: 'matching', pairs: { 学生: 'student' } }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Select 学生' }));

    expect(onChange).toHaveBeenCalledWith({
      kind: 'matching',
      pairs: {},
    });
  });

  it('unpairs via the right column as well', async () => {
    const onChange = jest.fn();
    const view = await render(
      <MatchingExercise
        prompt={prompt}
        value={{ kind: 'matching', pairs: { 学生: 'student' } }}
        disabled={false}
        onChange={onChange}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Match student' }));

    expect(onChange).toHaveBeenCalledWith({
      kind: 'matching',
      pairs: {},
    });
  });

  it('re-assigns partner when right item is already matched to another left item', async () => {
    const onChange = jest.fn();
    const view = await render(
      <MatchingExercise
        prompt={prompt}
        value={{ kind: 'matching', pairs: { 学生: 'student' } }}
        disabled={false}
        onChange={onChange}
      />,
    );

    // Select 老师 (unmatched)
    await fireEvent.press(view.getByRole('button', { name: 'Select 老师' }));
    // Match with student (was matched to 学生)
    await fireEvent.press(view.getByRole('button', { name: 'Match student' }));

    // Should reassign student to 老师 and remove 学生
    expect(onChange).toHaveBeenCalledWith({
      kind: 'matching',
      pairs: { 老师: 'student' },
    });
  });

  it('does not allow interaction when disabled is true', async () => {
    const onChange = jest.fn();
    const view = await render(
      <MatchingExercise
        prompt={prompt}
        value={{ kind: 'matching', pairs: {} }}
        disabled={true}
        onChange={onChange}
      />,
    );

    const btnLeft = view.getByRole('button', { name: 'Select 学生' });
    const btnRight = view.getByRole('button', { name: 'Match student' });

    await fireEvent.press(btnLeft);
    expect(btnLeft.props.accessibilityState.selected).toBe(false);

    await fireEvent.press(btnRight);
    expect(onChange).not.toHaveBeenCalled();
  });
});
