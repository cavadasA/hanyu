import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  buildResponderGrantEvent,
  buildResponderReleaseEvent,
} from '@testing-library/react-native/dist/event-builder';
import CardsScreen from './CardsScreen';
import { emptyState } from '@hanyu/domain';

const mockGetDueCards = jest.fn();
const mockReviewCard = jest.fn();
const mockRateCard = jest.fn();
const mockUndoRating = jest.fn();
const mockLoadDueCards = jest.fn();
const mockLogTime = jest.fn();
const mockCreateStarterDeck = jest.fn();
const mockGetDashboard = jest.fn();
const mockPush = jest.fn();
const mockOfflineService = {
  loadDueCards: (limit: number, deckId?: string | null) => mockLoadDueCards(limit, deckId),
  lastDeckSize: null as number | null,
  rateCard: (card: unknown, grade: string, timeMs: number | null) =>
    mockRateCard(card, grade, timeMs),
  undoRating: (reviewId: string) => mockUndoRating(reviewId),
};

jest.mock('../lib/data', () => ({
  getData: () => ({
    flashcards: {
      getDueCards: (limit?: number, deckId?: string | null) => mockGetDueCards(limit, deckId),
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

jest.mock('../offline/OfflineReviewProvider', () => ({
  useOfflineReview: () => ({
    service: mockOfflineService,
    ready: true,
    pendingCount: 0,
    refreshPendingCount: jest.fn(),
    sync: jest.fn(),
    syncing: false,
    lastSummary: null,
  }),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback]);
    },
    useRouter: () => ({ push: mockPush }),
    useLocalSearchParams: () => ({ deckId: 'd1' }),
  };
});

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

function card(id: string, hanzi: string) {
  return {
    id,
    user_id: 'user-test',
    word_id: id === 'c1' ? 1 : 2,
    skill: 'recognition' as const,
    hanzi,
    pinyin: 'nǐ hǎo',
    meaning_en: 'hello',
    hsk_level: 1,
    scheduling: emptyState(new Date('2099-01-01T00:00:00.000Z')),
    version: 1,
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
    mockOfflineService.lastDeckSize = 150;
    mockGetDueCards.mockReset();
    mockReviewCard.mockReset();
    mockRateCard.mockReset();
    mockUndoRating.mockReset();
    mockLoadDueCards.mockReset();
    mockLogTime.mockReset();
    mockCreateStarterDeck.mockReset();
    mockPush.mockReset();
    mockGetDashboard.mockReset().mockResolvedValue({
      cards: { total: 150, due: 2, by_status: { new: 100, learning: 30, review: 20 } },
    });
  });

  it('renders pre-session view with Reviews heading and Start review button', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);

    await renderCards();

    expect(screen.getByText('Reviews')).toBeTruthy();
    expect(screen.getByText('Start review')).toBeTruthy();
  });

  it('reveals the answer and advances to the next card after rating during active review', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();

    // Start session
    await fireEvent.press(screen.getByText('Start review'));

    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();

    await fireEvent.press(screen.getByText('Show answer'));
    expect(screen.getByText('hello')).toBeTruthy();

    await fireEvent.press(screen.getByText('Good'));

    expect(screen.getByText('谢谢')).toBeTruthy();
    expect(mockRateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'good', expect.any(Number));
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('logs study time and shows summary stats when the session ends', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
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

  it('rates through the offline service and never through the repository', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();

    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(mockRateCard).toHaveBeenCalledTimes(1);
    expect(mockReviewCard).not.toHaveBeenCalled();
  });

  it('undoes the rating that was actually written', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
    mockUndoRating.mockResolvedValue(card('c1', '你好'));

    await renderCards();

    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(screen.getByText('谢谢')).toBeTruthy();

    // Press undo button
    const undoButton = screen.getByLabelText('Undo last rating');
    await fireEvent.press(undoButton);

    expect(mockUndoRating).toHaveBeenCalledWith('r1');
    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('does not roll back the screen when the undo fails', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
    mockUndoRating.mockRejectedValue(new Error('This rating was already synced'));

    await renderCards();

    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));
    await fireEvent.press(screen.getByLabelText('Undo last rating'));

    expect(screen.getByText('This rating was already synced')).toBeTruthy();
    expect(screen.getByText('谢谢')).toBeTruthy();
  });

  it('creates the starter deck from the empty state', async () => {
    mockOfflineService.lastDeckSize = 0;
    mockGetDashboard.mockResolvedValueOnce({ cards: { total: 0, due: 0, by_status: {} } });
    mockLoadDueCards
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([card('c1', '你好')]);
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
    mockLoadDueCards.mockResolvedValue([]);

    await renderCards();

    expect(screen.getByText('No cards due right now')).toBeTruthy();
  });

  it('passes deckId to getDueCards in focus mode', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好')]);

    await renderCards();

    expect(mockLoadDueCards).toHaveBeenLastCalledWith(50, 'd1');
  });

  it('shows a back to deck action on the completion screen in focus mode', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();
    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(screen.getByText('Back to deck')).toBeTruthy();
  });

  it('vuelve a presentar dentro de la sesión una tarjeta fallada', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockImplementation(async (input: any, grade: string) => ({
      card: {
        ...input,
        scheduling: {
          ...input.scheduling,
          due: grade === 'again'
            ? new Date(Date.now() + 60_000).toISOString()
            : new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
      reviewId: `r-${grade}`,
    }));

    await renderCards();
    await fireEvent.press(screen.getByText('Start review'));

    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Again'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(screen.queryByText('Session complete')).toBeNull();
    expect(screen.getByText('你好')).toBeTruthy();
  });
});
