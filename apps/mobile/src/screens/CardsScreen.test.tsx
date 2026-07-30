import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CardsScreen from './CardsScreen';

const mockGetDueCards = jest.fn();
const mockReviewCard = jest.fn();
const mockLogTime = jest.fn();
const mockCreateStarterDeck = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    flashcards: {
      getDueCards: (limit?: number) => mockGetDueCards(limit),
      reviewCard: (id: string, quality: number, timeMs: number | null) =>
        mockReviewCard(id, quality, timeMs),
      createStarterDeck: (input: unknown) => mockCreateStarterDeck(input),
    },
    stats: { logTime: (ms: number) => mockLogTime(ms) },
  }),
}));

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

function card(id: string, hanzi: string) {
  return {
    id,
    hanzi,
    pinyin: 'nǐ hǎo',
    meaning_en: 'hello',
    hsk_level: 1,
    status: 'review',
  };
}

async function renderCards() {
  await act(async () => {
    await render(<CardsScreen />);
  });
}

describe('CardsScreen', () => {
  beforeEach(() => {
    mockGetDueCards.mockReset();
    mockReviewCard.mockReset();
    mockLogTime.mockReset();
    mockCreateStarterDeck.mockReset();
  });

  it('reveals the answer and advances to the next card after rating', async () => {
    mockGetDueCards.mockResolvedValue({
      cards: [card('c1', '你好'), card('c2', '谢谢')],
      total: 2,
      deck_size: 2,
    });
    mockReviewCard.mockResolvedValue({ card_id: 'c1', next_review: '2026-08-02' });

    await renderCards();

    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();

    await fireEvent.press(screen.getByText('Show answer'));
    expect(screen.getByText('hello')).toBeTruthy();

    await fireEvent.press(screen.getByText('Good'));

    expect(screen.getByText('谢谢')).toBeTruthy();
    expect(mockReviewCard).toHaveBeenCalledWith('c1', 4, expect.any(Number));
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('logs study time and shows the summary when the session ends', async () => {
    mockGetDueCards.mockResolvedValue({
      cards: [card('c1', '你好')],
      total: 1,
      deck_size: 1,
    });
    mockReviewCard.mockResolvedValue({ card_id: 'c1', next_review: '2026-08-02' });
    mockLogTime.mockResolvedValue(undefined);

    await renderCards();

    expect(screen.getByText('你好')).toBeTruthy();
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Easy'));

    expect(screen.getByText('Session complete')).toBeTruthy();
    expect(screen.getByText('You reviewed 1 card.')).toBeTruthy();
    expect(mockLogTime).toHaveBeenCalledTimes(1);
  });

  it('keeps the current card and retries the failed review', async () => {
    mockGetDueCards.mockResolvedValue({
      cards: [card('c1', '你好'), card('c2', '谢谢')],
      total: 2,
      deck_size: 2,
    });
    mockReviewCard
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce({ card_id: 'c1', next_review: '2026-08-02' });

    await renderCards();

    expect(screen.getByText('你好')).toBeTruthy();
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(screen.getByText('No connection. Check your network and try again.')).toBeTruthy();
    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.queryByText('谢谢')).toBeNull();

    await fireEvent.press(screen.getByText('Try again'));

    expect(mockReviewCard).toHaveBeenCalledTimes(2);
    expect(screen.getByText('谢谢')).toBeTruthy();
  });

  it('does not claim there are no due cards when the initial load failed', async () => {
    mockGetDueCards
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce({ cards: [], total: 0, deck_size: 150 });

    await renderCards();

    expect(screen.getByText('No connection. Check your network and try again.')).toBeTruthy();
    expect(screen.queryByText('No cards due right now')).toBeNull();

    await fireEvent.press(screen.getByText('Try again'));

    expect(screen.getByText('No cards due right now')).toBeTruthy();
  });

  it('shows the no-cards-due state when the deck has cards but none are due', async () => {
    mockGetDueCards.mockResolvedValue({ cards: [], total: 0, deck_size: 150 });

    await renderCards();

    expect(screen.getByText('No cards due right now')).toBeTruthy();
    expect(screen.getByText('0/0')).toBeTruthy();
  });

  it('creates the starter deck from the empty state', async () => {
    mockGetDueCards
      .mockResolvedValueOnce({ cards: [], total: 0, deck_size: 0 })
      .mockResolvedValueOnce({
        cards: [card('c1', '你好')],
        total: 1,
        deck_size: 150,
      });
    mockCreateStarterDeck.mockResolvedValue({ inserted: 150 });

    await renderCards();

    expect(screen.getByText('Set up your HSK2 starter deck')).toBeTruthy();
    await fireEvent.press(screen.getByText('Create starter deck'));

    expect(mockCreateStarterDeck).toHaveBeenCalledWith({
      strategy: 'hsk2_consolidation',
      limit: 150,
    });
    expect(screen.getByText('你好')).toBeTruthy();
  });

  it('speaks the card automatically in listening mode', async () => {
    const speech = jest.requireMock('expo-speech');
    speech.speak.mockClear();
    mockGetDueCards.mockResolvedValue({
      cards: [card('c1', '你好')],
      total: 1,
      deck_size: 1,
    });

    await renderCards();

    expect(screen.getByText('Recognition')).toBeTruthy();
    await fireEvent.press(screen.getByText('Listening'));

    expect(speech.speak).toHaveBeenCalledWith('你好', { language: 'zh-CN', rate: 0.8 });

    speech.stop.mockClear();
    await fireEvent.press(screen.getByText('Recognition'));

    expect(speech.stop).toHaveBeenCalledTimes(1);
  });
});
