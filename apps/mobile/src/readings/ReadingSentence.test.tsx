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

  it('distingue visualmente los cuatro estados', async () => {
    const tokens = [
      { id: 't0', text: '我', type: 'word', status: 'known', word: { id: 1 } },
      { id: 't1', text: '咖啡', type: 'word', status: 'learning', word: { id: 2 } },
      { id: 't2', text: '比', type: 'word', status: 'target', word: { id: 3 } },
      { id: 't3', text: '图书馆', type: 'word', status: 'unknown', word: null },
    ];

    await render(
      <ReadingSentence
        sentence={{ ...sentence, tokens }}
        showPinyin={false}
        onSelectToken={jest.fn()}
      />,
    );

    const colors = tokens.map(token => screen.getByText(token.text).props.style[1].color);
    expect(new Set(colors).size).toBe(4);
  });

  it('marca como desconocida la palabra sin tarjeta', async () => {
    const unknown = {
      ...sentence,
      tokens: [{ id: 't3', text: '图书馆', type: 'unknown' as const, word: null }],
    };

    await render(<ReadingSentence sentence={unknown} showPinyin={false} onSelectToken={jest.fn()} />);

    expect(screen.getByLabelText('图书馆').props.accessibilityHint).toMatch(/no está/i);
  });
});
