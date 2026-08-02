import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  buildResponderGrantEvent,
  buildResponderReleaseEvent,
} from '@testing-library/react-native/dist/event-builder';
import CardsScreen from './CardsScreen';

const mockGetDueCards = jest.fn();
const mockReviewCard = jest.fn();
const mockLogTime = jest.fn();
const mockCreateStarterDeck = jest.fn();
const mockGetDashboard = jest.fn();
const mockPush = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    flashcards: {
      getDueCards: (limit?: number) => mockGetDueCards(limit),
      reviewCard: (id: string, quality: number, timeMs: number | null) =>
        mockReviewCard(id, quality, timeMs),
      createStarterDeck: (input: unknown) => mockCreateStarterDeck(input),
    },
    stats: {
      logTime: (ms: number) => mockLogTime(ms),
      getDashboard: () => mockGetDashboard(),
    },
  }),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback]);
    },
    useRouter: () => ({ push: mockPush }),
  };
});

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

function responderGrantEvent() {
  return {
    ...buildResponderGrantEvent(),
    touchHistory: {
      mostRecentTimeStamp: 0,
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      touchBank: [
        {
          touchActive: true,
          startPageX: 0,
          startPageY: 0,
          startTimeStamp: 0,
          currentPageX: 0,
          currentPageY: 0,
          currentTimeStamp: 0,
          previousPageX: 0,
          previousPageY: 0,
          previousTimeStamp: 0,
        },
      ],
    },
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
    mockPush.mockReset();
    mockGetDashboard.mockReset().mockResolvedValue({
      cards: { total: 150, due: 2, by_status: { new: 100, learning: 30, review: 20 } },
    });
  });

  it('renders pre-session view with Reviews heading and Start review button', async () => {
    mockGetDueCards.mockResolvedValue({
      cards: [card('c1', '你好'), card('c2', '谢谢')],
      total: 2,
      deck_size: 2,
    });

    await renderCards();

    expect(screen.getByText('Reviews')).toBeTruthy();
    expect(screen.getByText('Start review')).toBeTruthy();
  });

  it('reveals the answer and advances to the next card after rating during active review', async () => {
    mockGetDueCards.mockResolvedValue({
      cards: [card('c1', '你好'), card('c2', '谢谢')],
      total: 2,
      deck_size: 2,
    });
    mockReviewCard.mockResolvedValue({ card_id: 'c1', next_review: '2026-08-02' });

    await renderCards();

    // Start session
    await fireEvent.press(screen.getByText('Start review'));

    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();

    await fireEvent.press(screen.getByText('Show answer'));
    expect(screen.getByText('hello')).toBeTruthy();

    await fireEvent.press(screen.getByText('Good'));

    expect(screen.getByText('谢谢')).toBeTruthy();
    expect(mockReviewCard).toHaveBeenCalledWith('c1', 4, expect.any(Number));
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('logs study time and shows summary stats when the session ends', async () => {
    mockGetDueCards.mockResolvedValue({
      cards: [card('c1', '你好')],
      total: 1,
      deck_size: 1,
    });
    mockReviewCard.mockResolvedValue({ card_id: 'c1', next_review: '2026-08-02' });
    mockLogTime.mockResolvedValue(undefined);

    await renderCards();

    await fireEvent.press(screen.getByText('Start review'));
    expect(screen.getByText('你好')).toBeTruthy();

    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Easy'));

    expect(screen.getByText('Session complete')).toBeTruthy();
    expect(screen.getByText(/You reviewed 1 card/)).toBeTruthy();
    expect(screen.getByText('Accuracy')).toBeTruthy();
    expect(mockLogTime).toHaveBeenCalledTimes(1);
  });

  it('allows undoing the previous rating', async () => {
    mockGetDueCards.mockResolvedValue({
      cards: [card('c1', '你好'), card('c2', '谢谢')],
      total: 2,
      deck_size: 2,
    });
    mockReviewCard.mockResolvedValue({ card_id: 'c1', next_review: '2026-08-02' });

    await renderCards();

    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(screen.getByText('谢谢')).toBeTruthy();

    // Press undo button
    const undoButton = screen.getByLabelText('Undo last rating');
    await fireEvent.press(undoButton);

    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
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
  });

  it('shows no cards due state when deck exists but no cards are due', async () => {
    mockGetDueCards.mockResolvedValue({ cards: [], total: 0, deck_size: 150 });

    await renderCards();

    expect(screen.getByText('No cards due right now')).toBeTruthy();
  });
});
