import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { WordsScreen } from './WordsScreen';

const mockGetWords = jest.fn();
const mockAddCard = jest.fn();
const mockGetDecks = jest.fn();
const mockPush = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    words: {
      getWords: (...args: unknown[]) => mockGetWords(...args),
    },
    flashcards: {
      addCard: (...args: unknown[]) => mockAddCard(...args),
    },
    decks: {
      getDecks: () => mockGetDecks(),
    },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const defaultDeck = {
  id: 'd1',
  name: 'My deck',
  is_default: true,
  word_count: 0,
  due_count: 0,
};

describe('WordsScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetWords.mockReset();
    mockAddCard.mockReset();
    mockGetDecks.mockReset();
    mockPush.mockReset();
    mockGetDecks.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('searches, filters, pages, and adds words to cards', async () => {
    mockGetWords.mockResolvedValue({
      items: [
        {
          id: 1,
          hanzi: '你好',
          pinyin: 'ni hao',
          meaning_en: 'hello',
          meaning_es: null,
          hsk_level: 1,
          pos: 'phrase',
          frequency: null,
          in_srs: false,
        },
      ],
      page: 1,
      page_size: 20,
      total: 21,
    });
    mockAddCard.mockResolvedValue({ card_id: 'card-1' });
    const view = await render(<WordsScreen />);

    await fireEvent.changeText(view.getByPlaceholderText('Buscar palabras'), 'ni');
    await fireEvent.press(view.getByRole('button', { name: 'HSK 2' }));
    await actTimers(300);

    await waitFor(() => expect(view.getByText('你好')).toBeTruthy());
    expect(mockGetWords).toHaveBeenLastCalledWith({
      search: 'ni',
      level: 2,
      page: 1,
      page_size: 20,
    });

    await fireEvent.press(view.getByRole('button', { name: 'Añadir 你好 a tus tarjetas' }));
    await waitFor(() => expect(view.getByText('Añadida')).toBeTruthy());
    expect(mockAddCard).toHaveBeenCalledWith(1);

    await fireEvent.press(view.getByRole('button', { name: 'Página siguiente' }));
    await actTimers(300);
    expect(mockGetWords).toHaveBeenLastCalledWith({
      search: 'ni',
      level: 2,
      page: 2,
      page_size: 20,
    });
  });

  it('adds a word to the selected deck', async () => {
    mockGetDecks.mockResolvedValue([
      { ...defaultDeck, id: 'd1' },
      { ...defaultDeck, id: 'd2', name: 'Travel', is_default: false },
    ]);
    mockGetWords.mockResolvedValue({
      items: [
        {
          id: 1,
          hanzi: '你好',
          pinyin: 'ni hao',
          meaning_en: 'hello',
          meaning_es: null,
          hsk_level: 1,
          pos: 'phrase',
          frequency: null,
          in_srs: false,
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
    });
    mockAddCard.mockResolvedValue({ card_id: 'card-1' });

    const view = await render(<WordsScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Mazo Travel' }));
    await actTimers(300);

    await waitFor(() => expect(view.getByText('你好')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Añadir 你好 a tus tarjetas' }));

    await waitFor(() => expect(mockAddCard).toHaveBeenCalledWith(1, { deckId: 'd2' }));
  });
});

async function actTimers(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}
