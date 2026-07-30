import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import { SessionProvider, useSession } from './SessionProvider';

const mockGetSession = jest.fn();
const mockSubscribeToAuthChanges = jest.fn((_handler: never) => () => undefined);
const mockStartAutoRefresh = jest.fn();
const mockStopAutoRefresh = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    auth: {
      getSession: () => mockGetSession(),
      subscribeToAuthChanges: (handler: unknown) => mockSubscribeToAuthChanges(handler as never),
      signOut: async () => undefined,
    },
    client: { auth: { startAutoRefresh: mockStartAutoRefresh, stopAutoRefresh: mockStopAutoRefresh } },
  }),
}));

function Probe() {
  const { session, loading } = useSession();
  return <Text>{loading ? 'loading' : session ? 'signed-in' : 'signed-out'}</Text>;
}

describe('SessionProvider', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockStartAutoRefresh.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports a signed-in session after bootstrap', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1', email: 'a@b.com' } });

    await act(async () => {
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
    });

    expect(screen.getByText('signed-in')).toBeTruthy();
  });

  it('reports signed-out when there is no session', async () => {
    mockGetSession.mockResolvedValue(null);

    await act(async () => {
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
    });

    expect(screen.getByText('signed-out')).toBeTruthy();
  });

  it('reports signed-out when reading the session fails', async () => {
    mockGetSession.mockRejectedValue(new Error('boom'));

    await act(async () => {
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
    });

    expect(screen.getByText('signed-out')).toBeTruthy();
  });

  it('starts token auto-refresh while the app is active', async () => {
    mockGetSession.mockResolvedValue(null);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      handler('active');
      return { remove: jest.fn() };
    });

    await act(async () => {
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
    });

    expect(mockStartAutoRefresh).toHaveBeenCalled();
  });
});
