import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { WordsScreen } from './WordsScreen';

const mockGetWords = jest.fn();
const mockAddCard = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    words: {
      getWords: (...args: unknown[]) => mockGetWords(...args),
    },
    flashcards: {
      addCard: (...args: unknown[]) => mockAddCard(...args),
    },
  }),
}));

describe('WordsScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetWords.mockReset();
    mockAddCard.mockReset();
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

    await fireEvent.changeText(view.getByPlaceholderText('Search words'), 'ni');
    await fireEvent.press(view.getByRole('button', { name: 'HSK 2' }));
    await actTimers(300);

    await waitFor(() => expect(view.getByText('你好')).toBeTruthy());
    expect(mockGetWords).toHaveBeenLastCalledWith({
      search: 'ni',
      level: 2,
      page: 1,
      page_size: 20,
    });

    await fireEvent.press(view.getByRole('button', { name: 'Add 你好 to Cards' }));
    await waitFor(() => expect(view.getByText('Added')).toBeTruthy());
    expect(mockAddCard).toHaveBeenCalledWith(1);

    await fireEvent.press(view.getByRole('button', { name: 'Next page' }));
    await actTimers(300);
    expect(mockGetWords).toHaveBeenLastCalledWith({
      search: 'ni',
      level: 2,
      page: 2,
      page_size: 20,
    });
  });
});

async function actTimers(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}
