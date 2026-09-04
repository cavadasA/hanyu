import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReadingSentence } from './ReadingSentence';

const sentence = {
  zh: '咖啡比茶贵。',
  pinyin: 'Kāfēi bǐ chá guì.',
  es: 'El café es más caro que el té.',
  tokens: [
    { id: 't0', text: '咖啡', type: 'word' as const, word: { id: 1, hanzi: '咖啡', pinyin: 'kāfēi' } },
    { id: 't1', text: '比', type: 'word' as const, word: { id: 2, hanzi: '比', pinyin: 'bǐ' } },
    { id: 't2', text: '。', type: 'punctuation' as const, word: null },
  ],
} as any;

describe('ReadingSentence', () => {
  it('muestra el pinyin una sola vez, junto a su frase', async () => {
    await render(<ReadingSentence sentence={sentence} showPinyin onSelectToken={jest.fn()} />);

    expect(screen.getAllByText('Kāfēi bǐ chá guì.')).toHaveLength(1);
  });

  it('no muestra pinyin cuando está desactivado', async () => {
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={jest.fn()} />);

    expect(screen.queryByText('Kāfēi bǐ chá guì.')).toBeNull();
  });

  it('avisa de qué token se ha tocado', async () => {
    const onSelectToken = jest.fn();
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={onSelectToken} />);

    await fireEvent.press(screen.getByLabelText('比'));

    expect(onSelectToken).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('la puntuación no es pulsable', async () => {
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={jest.fn()} />);

    expect(screen.queryByLabelText('。')).toBeNull();
  });

  it('muestra la traducción solo al tocar la frase', async () => {
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={jest.fn()} />);

    expect(screen.queryByText('El café es más caro que el té.')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Traducir la frase'));

    expect(screen.getByText('El café es más caro que el té.')).toBeTruthy();
  });

  it('vuelve a esconderla al tocar otra vez', async () => {
    await render(<ReadingSentence sentence={sentence} showPinyin={false} onSelectToken={jest.fn()} />);

    await fireEvent.press(screen.getByLabelText('Traducir la frase'));
    await fireEvent.press(screen.getByLabelText('Traducir la frase'));

    expect(screen.queryByText('El café es más caro que el té.')).toBeNull();
  });
});
