import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, Pressable, Text } from 'react-native';
import { SessionProvider, useSession } from './SessionProvider';

const mockGetSession = jest.fn();
const mockSubscribeToAuthChanges = jest.fn((_handler: never) => () => undefined);
const mockStartAutoRefresh = jest.fn();
const mockStopAutoRefresh = jest.fn();
const mockClearReviewSession = jest.fn(async () => undefined);

jest.mock('../lib/reviewSessionStore', () => ({
  clearReviewSession: () => mockClearReviewSession(),
}));

const mockClearAllExamProgress = jest.fn(async () => undefined);
jest.mock('../exam/examProgressStore', () => ({
  clearAllExamProgress: () => mockClearAllExamProgress(),
}));

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
  const { session, loading, signOut } = useSession();
  return (
    <Pressable onPress={() => void signOut()}>
      <Text>{loading ? 'loading' : session ? 'signed-in' : 'signed-out'}</Text>
    </Pressable>
  );
}

describe('SessionProvider', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockStartAutoRefresh.mockClear();
    mockClearReviewSession.mockClear();
    mockClearAllExamProgress.mockClear();
    mockSubscribeToAuthChanges.mockImplementation((_handler: never) => () => undefined);
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

  // La sesión de repaso a medias se guarda en el dispositivo sin dueño: sin
  // esto, quien entra después ve «Continue review» con las tarjetas de otro.
  it('olvida la sesión de repaso guardada al cerrar sesión', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    await act(async () => {
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByText('signed-in'));
    });

    expect(mockClearReviewSession).toHaveBeenCalled();
  });

  it('olvida el simulacro a medias al cerrar sesión', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    await act(async () => {
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
    });
    expect(mockClearAllExamProgress).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByText('signed-in'));
    });

    expect(mockClearAllExamProgress).toHaveBeenCalled();
  });

  it('olvida la sesión de repaso guardada cuando entra otro usuario', async () => {
    let emit: (event: { session: unknown }) => void = () => undefined;
    mockSubscribeToAuthChanges.mockImplementation(((handler: typeof emit) => {
      emit = handler;
      return () => undefined;
    }) as never);
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    await act(async () => {
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
    });
    await act(async () => {
      emit({ session: { user: { id: 'user-1' } } });
    });
    expect(mockClearReviewSession).not.toHaveBeenCalled();

    await act(async () => {
      emit({ session: { user: { id: 'user-2' } } });
    });
    expect(mockClearReviewSession).toHaveBeenCalled();
  });
});
