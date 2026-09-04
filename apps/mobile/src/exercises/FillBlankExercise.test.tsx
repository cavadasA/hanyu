import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FillBlankExercise } from './FillBlankExercise';

const prompt = {
  kind: 'fill_blank' as const,
  sentence: '我已经吃饭了。',
  options: ['已经', '还没', '正在', '一起'],
};
const answer = { kind: 'fill_blank' as const, text: '' };

async function renderFillBlank() {
  await act(async () => {
    render(<FillBlankExercise prompt={prompt} value={answer} disabled={false} onChange={jest.fn()} />);
  });
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
});
