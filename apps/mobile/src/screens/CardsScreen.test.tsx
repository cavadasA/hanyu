import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  buildResponderGrantEvent,
  buildResponderReleaseEvent,
} from '@testing-library/react-native/dist/event-builder';
import CardsScreen from './CardsScreen';
import { emptyState } from '@hanyu/domain';
import {
  clearReviewSession,
  loadReviewSession,
  saveReviewSession,
} from '../lib/reviewSessionStore';

const mockGetDueCards = jest.fn();
const mockReviewCard = jest.fn();
const mockRateCard = jest.fn();
const mockUndoRating = jest.fn();
const mockLoadQueue = jest.fn();
const mockLogTime = jest.fn();
const mockGetDashboard = jest.fn();
const mockPush = jest.fn();
const mockPreviewIntervals = jest.fn((..._args: unknown[]) => ({
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
}));
let mockRequestRetention = 0.9;
const mockOfflineService = {
  loadQueue: (skill?: string, deckId?: string | null) =>
    mockLoadQueue(skill ?? 'recognition', deckId),
  lastDeckSize: null as number | null,
  rateCard: (card: unknown, grade: string, timeMs: number | null) =>
    mockRateCard(card, grade, timeMs),
  undoRating: (reviewId: string) => mockUndoRating(reviewId),
};

jest.mock('@hanyu/domain', () => {
  const actual = jest.requireActual('@hanyu/domain');
  return {
    ...actual,
    previewIntervals: (...args: unknown[]) => mockPreviewIntervals(...args),
  };
});

jest.mock('../lib/data', () => ({
  getData: () => ({
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
    requestRetention: mockRequestRetention,
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
jest.mock('expo-crypto', () => ({ randomUUID: () => 'generated-session' }));

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
  beforeEach(async () => {
    await clearReviewSession();
    mockOfflineService.lastDeckSize = 150;
    mockGetDueCards.mockReset();
    mockReviewCard.mockReset();
    mockRateCard.mockReset();
    mockUndoRating.mockReset();
    mockLoadQueue.mockReset();
    mockLogTime.mockReset();
    mockPush.mockReset();
    mockPreviewIntervals.mockReset().mockReturnValue({ again: 1, hard: 2, good: 3, easy: 4 });
    mockRequestRetention = 0.9;
    mockGetDashboard.mockReset().mockResolvedValue({
      cards: { total: 150, due: 2, by_status: { new: 100, learning: 30, review: 20 } },
    });
  });

  afterEach(async () => {
    await clearReviewSession();
  });

  it('renders pre-session view with Reviews heading and Start review button', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);

    await renderCards();

    expect(screen.getByText('Reviews')).toBeTruthy();
    expect(screen.getByText('Start review')).toBeTruthy();
  });

  it('reveals the answer and advances to the next card after rating during active review', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
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
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
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
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();

    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(mockRateCard).toHaveBeenCalledTimes(1);
    expect(mockReviewCard).not.toHaveBeenCalled();
  });

  it('undoes the rating that was actually written', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
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
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
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

  it('opens the diagnostic from the empty state', async () => {
    mockOfflineService.lastDeckSize = 0;
    mockGetDashboard.mockResolvedValueOnce({ cards: { total: 0, due: 0, by_status: {} } });
    mockLoadQueue.mockResolvedValue([]);

    await renderCards();

    expect(screen.getByText('Set up your HSK2 study plan')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start diagnostic'));

    expect(mockPush).toHaveBeenCalledWith('/diagnostic');
  });

  it('shows no cards due state when deck exists but no cards are due', async () => {
    mockLoadQueue.mockResolvedValue([]);

    await renderCards();

    expect(screen.getByText('No cards due right now')).toBeTruthy();
  });

  it('no pide un número fijo de tarjetas: la cola la decide el servidor', async () => {
    mockLoadQueue.mockResolvedValue([]);

    await renderCards();

    expect(mockLoadQueue).toHaveBeenCalledWith('recognition', 'd1');
    expect(JSON.stringify(mockLoadQueue.mock.calls)).not.toContain('50');
  });

  it('pide la cola de la habilidad seleccionada', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);

    await renderCards();
    await fireEvent.press(screen.getByRole('button', { name: 'Recall' }));

    await waitFor(() => expect(mockLoadQueue).toHaveBeenLastCalledWith('recall', 'd1'));
  });

  it('recalcula el preview cuando cambia la retención del proveedor', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);

    const view = await act(async () => render(<CardsScreen />));
    await fireEvent.press(screen.getByText('Start review'));

    expect(mockPreviewIntervals).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.any(Date),
      expect.objectContaining({ request_retention: 0.9 }),
    );

    mockRequestRetention = 0.95;
    await view.rerender(<CardsScreen />);

    expect(mockPreviewIntervals).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.any(Date),
      expect.objectContaining({ request_retention: 0.95 }),
    );
  });

  it('en recuerdo pide escribir la respuesta y no revelar la tarjeta', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();
    await fireEvent.press(screen.getByRole('button', { name: 'Recall' }));
    await waitFor(() => expect(mockLoadQueue).toHaveBeenLastCalledWith('recall', 'd1'));
    await fireEvent.press(screen.getByRole('button', { name: 'Start review' }));

    expect(screen.getByPlaceholderText('Type the answer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();

    await fireEvent.changeText(screen.getByPlaceholderText('Type the answer'), '你好');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(mockRateCard).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(mockRateCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      expect.any(String),
      expect.any(Number),
    ));
  });

  it('shows a back to deck action on the completion screen in focus mode', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();
    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(screen.getByText('Back to deck')).toBeTruthy();
  });

  it('vuelve a presentar dentro de la sesión una tarjeta fallada', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
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

  it('reanuda en la siguiente tarjeta guardada aunque las anteriores ya no estén vencidas', async () => {
    const currentCards = Array.from({ length: 5 }, (_, offset) =>
      card(`c${offset + 5}`, `word-${offset + 5}`),
    );
    mockLoadQueue.mockResolvedValue(currentCards);
    await saveReviewSession({
      session_id: 'saved-session',
      deck_id: 'd1',
      card_ids: Array.from({ length: 10 }, (_, index) => `c${index}`),
      index: 5,
      mode: 'recognition',
      started_at: Date.now(),
      reviewed: 5,
      stats: { reviewed: 5, correct: 4, again: 1 },
    });

    await renderCards();
    await fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText('word-5')).toBeTruthy();
    expect(screen.getByText('1/5')).toBeTruthy();
  });

  it('removes a requeued Again card when Undo returns to it', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockImplementation(async (input: any, grade: string) => ({
      card: {
        ...input,
        scheduling: {
          ...input.scheduling,
          due: new Date(Date.now() + (grade === 'again' ? 60_000 : 86_400_000)).toISOString(),
        },
      },
      reviewId: `r-${grade}`,
    }));
    mockUndoRating.mockResolvedValue(card('c1', '你好'));

    await renderCards();
    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Again'));

    expect(screen.getByText('2/3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Undo last rating'));

    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('persists the rewound position after a successful Undo', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
    mockUndoRating.mockResolvedValue(card('c1', '你好'));

    await renderCards();
    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));
    await fireEvent.press(screen.getByLabelText('Undo last rating'));

    await waitFor(async () => {
      await expect(loadReviewSession()).resolves.toMatchObject({
        index: 0,
        reviewed: 0,
        card_ids: ['c1', 'c2'],
        stats: { reviewed: 0, correct: 0, again: 0 },
      });
    });
  });

  it('discards the resumable session from the CardsScreen banner', async () => {
    mockLoadQueue.mockResolvedValue([card('c1', '你好')]);
    await saveReviewSession({
      session_id: 'discard-me',
      deck_id: 'd1',
      card_ids: ['c1'],
      index: 0,
      mode: 'recognition',
      started_at: Date.now(),
      reviewed: 0,
      stats: { reviewed: 0, correct: 0, again: 0 },
    });

    await renderCards();
    await fireEvent.press(screen.getByText('Discard'));

    expect(screen.queryByText('Continue')).toBeNull();
    await expect(loadReviewSession()).resolves.toBeNull();
  });
});
