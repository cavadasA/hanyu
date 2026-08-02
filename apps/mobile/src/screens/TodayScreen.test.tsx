import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { setReviewSession, clearReviewSession } from '../lib/reviewSessionStore';
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
  profile: { current_level: 2, mode: 'hsk2_consolidation' },
  flashcards: { deck_size: 150, due: 18, target: 20, completed: 2 },
  exercises: { target: 5, completed: 0 },
  reading: {
    target: 1,
    completed: 0,
    level: 2,
    next: { id: 'r1', title: 'Cafe', hsk_level: 2, format: 'story' },
  },
  progress: { completed_blocks: 1, total_blocks: 3 },
};

const completedPayload = {
  ...payload,
  flashcards: { deck_size: 150, due: 0, target: 20, completed: 20 },
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
  beforeEach(() => {
    mockGetToday.mockReset();
    mockGetDashboard.mockReset();
    mockPush.mockReset();
    clearReviewSession();
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

  it('shows ProgressRing with streak and block progress', async () => {
    mockGetToday.mockResolvedValue(payload);
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByTestId('progress-ring')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
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
    setReviewSession({ active: true, total: 20, reviewed: 5, mode: 'recognition', startedAt: Date.now() });

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
});
