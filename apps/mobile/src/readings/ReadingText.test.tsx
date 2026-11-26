import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import type { ReadingToken } from '@hanyu/data';
import { ReadingText } from './ReadingText';

const mockAddCard = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    flashcards: {
      addCard: (...args: unknown[]) => mockAddCard(...args),
    },
    events: {
      recordEvent: jest.fn().mockResolvedValue({ id: 1 }),
    },
  }),
}));

const tokens: ReadingToken[] = [
  {
    id: 't0',
    text: '你好',
    type: 'word',
    word: {
      id: 1,
      hanzi: '你好',
      sense_index: null,
      variants: ['你好'],
      traditional: null,
      pinyin: 'ni hao',
      meaning_en: 'hello',
      meaning_es: null,
      classifier: null,
      hsk_level: 1,
      pos: 'phrase',
      frequency: null,
      in_srs: false,
    },
  },
  { id: 't2', text: '，', type: 'punctuation', word: null },
  { id: 't3', text: '龘', type: 'unknown', word: null },
  { id: 't4', text: '。', type: 'punctuation', word: null },
];

describe('ReadingText', () => {
  beforeEach(() => {
    mockAddCard.mockReset();
  });

  // En línea, la ficha aparecía al final del texto: quien tocaba una palabra de
  // arriba no veía nada. Va en una hoja modal, sobre lo que se está leyendo.
  it('abre la ficha de la palabra en una hoja modal y la cierra al tocar fuera', async () => {
    const view = await render(
      <ReadingText
        sentences={[{ zh: '你好，龘。', pinyin: 'ni hao', es: 'Hello.', tokens }]}
        showPinyin={false}
        readingId="reading-1"
      />,
    );

    expect(view.queryByTestId('word-sheet-modal')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: '你好' }));

    const modal = view.getByTestId('word-sheet-modal');
    expect(modal.type).toBe('Modal');
    expect(within(modal).getByText('hello')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Cerrar la ficha de la palabra'));
    expect(view.queryByTestId('word-sheet-modal')).toBeNull();
  });

  it('opens known and unknown word details and adds a known word once', async () => {
    mockAddCard.mockResolvedValue({ card_id: 'card-1' });
    const view = await render(
      <ReadingText
        sentences={[{ zh: '你好，龘。', pinyin: 'ni hao', es: 'Hello.', tokens }]}
        showPinyin={false}
        readingId="reading-1"
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: '你好' }));
    expect(view.getByText('ni hao')).toBeTruthy();
    expect(view.getByText('hello')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: /Añadir a tus tarjetas: ni hao/ }));
    await waitFor(() => expect(view.getByText('Añadir a tus tarjetas: ni hao, hello')).toBeTruthy());
    expect(mockAddCard).toHaveBeenCalledWith(1, {
      context: {
        sentence: '你好，龘。',
        source_kind: 'reading',
        source_id: 'reading-1',
      },
    });

    await fireEvent.press(view.getByRole('button', { name: '龘' }));
    expect(view.getByText('Palabra desconocida')).toBeTruthy();
    expect(view.queryByRole('button', { name: '，' })).toBeNull();
  });

  it('pone primero la acepción del token, no la más cercana al nivel de la lectura', async () => {
    const senses = [
      { id: 2, hanzi: '还', pinyin: 'huán', meaning_es: 'devolver', hsk_level: 3 },
      { id: 1, hanzi: '还', pinyin: 'hái', meaning_es: 'todavía', hsk_level: 1 },
    ];
    const sentenceTokens: ReadingToken[] = [{
      id: 't0',
      text: '还',
      type: 'word',
      word: senses[0] as ReadingToken['word'],
      senses: senses as ReadingToken['senses'],
    }];

    const view = await render(
      <ReadingText
        sentences={[{ zh: '还', pinyin: '', es: '', tokens: sentenceTokens }]}
        showPinyin={false}
        readingId="reading-1"
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: '还' }));

    expect(view.getAllByRole('button', { name: /Añadir a tus tarjetas/ })[0].props.accessibilityLabel)
      .toContain('huán');
    expect(view.queryByText('todavía')).toBeNull();
  });

  it('reinicia el estado de la ficha al cambiar de palabra', async () => {
    const first = { ...tokens[0], word: { ...tokens[0].word!, in_srs: false } };
    const second = {
      id: 't5',
      text: '谢谢',
      type: 'word' as const,
      word: { ...tokens[0].word!, id: 2, hanzi: '谢谢', pinyin: 'xie xie', in_srs: true },
    };
    const view = await render(
      <ReadingText
        sentences={[{ zh: '你好谢谢', pinyin: '', es: '', tokens: [first, second] }]}
        showPinyin={false}
        readingId="reading-1"
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: '你好' }));
    await fireEvent.press(view.getByRole('button', { name: '谢谢' }));

    expect(view.getByRole('button', { name: /Añadir a tus tarjetas: xie xie/ }).props.accessibilityState)
      .toMatchObject({ disabled: true });
  });
});
