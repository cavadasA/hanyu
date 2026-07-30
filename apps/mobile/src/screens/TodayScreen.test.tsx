import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the streak, due count, and block progress', async () => {
    mockGetToday.mockResolvedValue(payload);
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByText('12 day streak')).toBeTruthy();
    expect(screen.getByText('18 cards due')).toBeTruthy();
    expect(screen.getByText('1 of 3 blocks done')).toBeTruthy();
  });

  it('opens mobile exercises and readings from the rest of the session card', async () => {
    mockGetToday.mockResolvedValue(payload);
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByText('Exercises 0/5')).toBeTruthy();
    expect(screen.getByText('Reading 0/1')).toBeTruthy();

    await fireEvent.press(screen.getByText('Start exercises'));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/exercises');

    await fireEvent.press(screen.getByText('Start reading'));
    expect(mockPush).toHaveBeenLastCalledWith('/practice/readings');
  });

  it('shows a retryable error when loading fails', async () => {
    mockGetToday.mockRejectedValue({ message: 'Failed to load deck size' });
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();

    expect(screen.getByText('Failed to load deck size')).toBeTruthy();

    mockGetToday.mockResolvedValue(payload);
    await act(async () => {
      await fireEvent.press(screen.getByText('Try again'));
    });

    expect(screen.getByText('18 cards due')).toBeTruthy();
  });

  it('still renders when the dashboard call fails', async () => {
    mockGetToday.mockResolvedValue(payload);
    mockGetDashboard.mockRejectedValue(new Error('offline'));

    await renderToday();

    expect(screen.getByText('18 cards due')).toBeTruthy();
    expect(screen.getByText('0 day streak')).toBeTruthy();
  });

  it('reloads Today when the app becomes active again', async () => {
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      onAppStateChange = handler;
      return { remove: jest.fn() };
    });
    mockGetToday.mockResolvedValue(payload);
    mockGetDashboard.mockResolvedValue(dashboard);

    await renderToday();
    expect(mockGetToday).toHaveBeenCalledTimes(1);

    await act(async () => {
      onAppStateChange?.('active');
    });

    expect(mockGetToday).toHaveBeenCalledTimes(2);
  });
});
