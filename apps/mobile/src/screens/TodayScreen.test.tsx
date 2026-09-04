import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { clearReviewSession, saveReviewSession } from '../lib/reviewSessionStore';
import TodayScreen from './TodayScreen';

const mockGetToday = jest.fn();
const mockGetDashboard = jest.fn();
const mockPush = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    today: { getToday: () => mockGetToday() },
    stats: { getDashboard: () => mockGetDashboard() },
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

const payload = {
  profile: { current_level: 2 },
  flashcards: { deck_size: 150, due: 18, new_target: 10, review_target: 200, completed: 2 },
  exercises: { target: 5, completed: 0 },
  reading: {
    target: 1,
    completed: 0,
    level: 2,
    next: { slug: 'r1', title: 'Cafe', hsk_level: 2, format: 'story' },
  },
  progress: { completed_blocks: 1, total_blocks: 3 },
};

const completedPayload = {
  ...payload,
  flashcards: { deck_size: 150, due: 0, new_target: 10, review_target: 200, completed: 20 },
  exercises: { target: 5, completed: 5 },
  reading: { target: 1, completed: 1, level: 2, next: null },
  progress: { completed_blocks: 3, total_blocks: 3 },
};

const dashboard = {
  streak: { current: 12, longest: 30 },
  cards: { total: 150, due: 18, by_status: { new: 100, learning: 30, review: 20 } },
};

async function renderToday() {
  await act(async () => {
    await render(<TodayScreen />);
  });
}

describe('TodayScreen', () => {
  beforeEach(async () => {
    mockGetToday.mockReset();
    mockGetDashboard.mockReset();
    mockPush.mockReset();
    await clearReviewSession();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders date and HSK badge without greeting', async () => {
    mockGetToday.mockResolvedValue(payload);
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByText(/HSK2/)).toBeTruthy();
    expect(screen.queryByText('Good morning')).toBeNull();
  });

  it('shows progress card with streak and block progress', async () => {
    mockGetToday.mockResolvedValue(payload);
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByTestId('progress-ring')).toBeTruthy();
    expect(screen.getByText('12 day streak')).toBeTruthy();
    expect(screen.getByText(/1 of 3 blocks completed today/)).toBeTruthy();
  });

  it('opens mobile exercises and readings from the plan card', async () => {
    mockGetToday.mockResolvedValue(payload);
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    await fireEvent.press(screen.getByText('Start exercises'));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/exercises');

    await fireEvent.press(screen.getByText('Start reading'));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/readings');
  });

  it('shows active session banner when a review is in progress', async () => {
    mockGetToday.mockResolvedValue(payload);
    mockGetDashboard.mockResolvedValue(dashboard);
    await saveReviewSession({
      session_id: 's1',
      deck_id: null,
      card_ids: Array.from({ length: 20 }, (_, index) => `card-${index}`),
      index: 5,
      mode: 'recognition',
      started_at: Date.now(),
      reviewed: 5,
      stats: { reviewed: 5, correct: 5, again: 0 },
    });

    await renderToday();

    expect(screen.getByText(/15 cards left/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockPush).toHaveBeenLastCalledWith('/cards');
  });

  it('renders completed state with extra practice when all blocks are complete', async () => {
    mockGetToday.mockResolvedValue(completedPayload);
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByText('Session complete! Well done.')).toBeTruthy();
    expect(screen.getByText('Quick review')).toBeTruthy();
    expect(screen.getByText('Free reading')).toBeTruthy();
    expect(screen.getByText('Browse grammar')).toBeTruthy();
  });

  it('dice qué unidad se está estudiando', async () => {
    mockGetToday.mockResolvedValue({
      ...payload,
      steps: [
        {
          kind: 'new_items',
          status: 'ready',
          payload: { count: 5, unit_title: '离合词', unit_progress: '1/4' },
        },
      ],
    });
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByText('离合词')).toBeTruthy();
    expect(screen.getByText('1/4')).toBeTruthy();
  });

  it('explica por qué propone una lectura', async () => {
    mockGetToday.mockResolvedValue({
      ...payload,
      steps: [
        {
          kind: 'reading',
          status: 'ready',
          payload: { id: 'r1' },
          why: [
            { kind: 'reinforces_targets', count: 6 },
            { kind: 'comprehensible', ratio: 0.95 },
          ],
        },
      ],
    });
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByText('Refuerza 6 palabras que estás aprendiendo')).toBeTruthy();
  });

  it('dice que no hay lecturas en vez de mostrar un bloque vacío', async () => {
    mockGetToday.mockResolvedValue({
      ...payload,
      steps: [{ kind: 'reading', status: 'unavailable', reason: 'no_content' }],
    });
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByText('Todavía no hay lecturas disponibles')).toBeTruthy();
  });
});
