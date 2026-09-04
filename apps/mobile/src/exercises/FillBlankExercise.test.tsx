import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FillBlankExercise } from './FillBlankExercise';

const prompt = {
  kind: 'fill_blank' as const,
  sentence: '我已经吃饭了。',
  options: ['已经', '还没', '正在', '一起'],
};
const answer = { kind: 'fill_blank' as const, text: '' };

async function renderFillBlank(onHintUsed = jest.fn()) {
  await act(async () => {
    render(
      <FillBlankExercise
        prompt={prompt}
        value={answer}
        disabled={false}
        onChange={jest.fn()}
        onHintUsed={onHintUsed}
      />,
    );
  });

  return onHintUsed;
}

describe('FillBlankExercise', () => {
  it('no muestra las opciones mientras se escribe', async () => {
    await renderFillBlank();

    expect(screen.queryByText('已经')).toBeNull();
  });

  it('ofrece las opciones solo si se piden', async () => {
    await renderFillBlank();
    await fireEvent.press(screen.getByText('Ver opciones'));

    expect(screen.getByText('已经')).toBeTruthy();
  });

  it('registra la pista al revelar las opciones', async () => {
    const onHintUsed = await renderFillBlank();
    await fireEvent.press(screen.getByText('Ver opciones'));

    expect(onHintUsed).toHaveBeenCalledTimes(1);
  });
});
