/**
 * Unit tests for OfflineReviewProvider and useOfflineReview hook.
 *
 * All real I/O is mocked:
 * - openReviewStore  → returns a hand-written fake ReviewStore
 * - useSession       → returns a controlled session value
 * - getData          → returns a stub with flashcards.getDueCards
 * - expo-crypto      → randomUUID returns 'mock-uuid'
 *
 * No real SQLite or network is touched here.
 *
 * NOTE: @testing-library/react-native v14 returns an async renderHook, rerender,
 * and unmount. All must be awaited.
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { emptyState } from '@hanyu/domain';

// ---------------------------------------------------------------------------
// Mocks (factory mocks prevent transitive expo-sqlite loading)
// ---------------------------------------------------------------------------

jest.mock('./openReviewStore', () => ({ openReviewStore: jest.fn() }));
jest.mock('../session/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../lib/data', () => ({ getData: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'mock-uuid') }));

import { openReviewStore } from './openReviewStore';
import { useSession } from '../session/SessionProvider';
import { getData } from '../lib/data';
import { OfflineReviewProvider, useOfflineReview } from './OfflineReviewProvider';

const mockOpenReviewStore = openReviewStore as jest.Mock;
const mockUseSession = useSession as jest.Mock;
const mockGetData = getData as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStore(pendingCountValue = 0) {
  return {
    cacheCards: jest.fn().mockResolvedValue(undefined),
    getDueProjectedCards: jest.fn().mockResolvedValue([]),
    enqueueAndProject: jest.fn().mockResolvedValue(undefined),
    listPending: jest.fn().mockResolvedValue([]),
    acknowledge: jest.fn().mockResolvedValue(undefined),
    rebase: jest.fn().mockResolvedValue(undefined),
    markPermanentError: jest.fn().mockResolvedValue(undefined),
    markSyncing: jest.fn().mockResolvedValue(true),
    markPending: jest.fn().mockResolvedValue(undefined),
    discardPending: jest.fn().mockResolvedValue(null),
    pendingCount: jest.fn().mockResolvedValue(pendingCountValue),
    setParams: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
  };
}

function makeSessionValue(overrides: { userId?: string | null; loading?: boolean } = {}) {
  const { userId = null, loading = false } = overrides;
  return {
    session: userId ? { user: { id: userId } } : null,
    loading,
    signOut: jest.fn(),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <OfflineReviewProvider>{children}</OfflineReviewProvider>;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetData.mockReturnValue({
    flashcards: {
      getDueCards: jest.fn().mockResolvedValue({ cards: [] }),
      reviewCardEvent: jest.fn().mockResolvedValue({ outcome: 'applied', card: {} }),
    },
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OfflineReviewProvider – session loading / no user', () => {
  test('exposes ready=false and service=null while session is still loading', async () => {
    mockUseSession.mockReturnValue(makeSessionValue({ loading: true }));

    const { result } = await renderHook(() => useOfflineReview(), { wrapper });

    expect(result.current.ready).toBe(false);
    expect(result.current.service).toBeNull();
    expect(result.current.pendingCount).toBe(0);
    expect(mockOpenReviewStore).not.toHaveBeenCalled();
  });

  test('exposes ready=false and service=null when session loaded but no user', async () => {
    mockUseSession.mockReturnValue(makeSessionValue({ userId: null, loading: false }));

    const { result } = await renderHook(() => useOfflineReview(), { wrapper });

    expect(result.current.ready).toBe(false);
    expect(result.current.service).toBeNull();
    expect(mockOpenReviewStore).not.toHaveBeenCalled();
  });

  test('refreshPendingCount is a no-op when service is null', async () => {
    mockUseSession.mockReturnValue(makeSessionValue({ userId: null }));

    const { result } = await renderHook(() => useOfflineReview(), { wrapper });

    await expect(result.current.refreshPendingCount()).resolves.toBeUndefined();
  });
});

describe('OfflineReviewProvider – store open on user available', () => {
  test('opens the store with the correct userId and becomes ready=true', async () => {
    const mockStore = makeMockStore();
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-abc' }));

    const { result } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.service).not.toBeNull();
    expect(mockOpenReviewStore).toHaveBeenCalledWith('user-abc', expect.objectContaining({ request_retention: 0.9 }));
  });

  test('does not open the store twice for the same userId', async () => {
    const mockStore = makeMockStore();
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { rerender } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(mockOpenReviewStore).toHaveBeenCalledTimes(1));

    await rerender({}); // same userId — must not trigger another open

    expect(mockOpenReviewStore).toHaveBeenCalledTimes(1);
  });

  test('relee la retención antes de valorar una tarjeta', async () => {
    let currentRetention = 0.9;
    const settings = { getSettings: jest.fn(() => Promise.resolve({ request_retention: currentRetention })) };
    mockGetData.mockReturnValue({
      settings,
      flashcards: {
        getDueCards: jest.fn().mockResolvedValue({ cards: [] }),
        reviewCardEvent: jest.fn().mockResolvedValue({ outcome: 'applied', card: {} }),
        revertReview: jest.fn(),
      },
    });
    const mockStore = makeMockStore();
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { result } = await renderHook(() => useOfflineReview(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    currentRetention = 0.95;
    await act(async () => {
      await result.current.service?.rateCard({
        id: 'card-1',
        user_id: 'user-1',
        word_id: 1,
        skill: 'recognition',
        scheduling: emptyState(new Date('2026-09-03T10:00:00.000Z')),
        version: 0,
      }, 'good', 1000);
    });

    expect(settings.getSettings).toHaveBeenCalledTimes(2);
    expect(mockStore.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ request_retention: 0.95 }),
    );
  });
});

describe('OfflineReviewProvider – logout cleanup (pendingCount-gated)', () => {
  test('calls destroy when pendingCount=0 on logout', async () => {
    const mockStore = makeMockStore(0);
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { result, rerender } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    // Simulate logout
    await act(async () => {
      mockUseSession.mockReturnValue(makeSessionValue({ userId: null }));
      await rerender({});
    });

    await waitFor(() => expect(mockStore.destroy).toHaveBeenCalledTimes(1));
    expect(mockStore.close).not.toHaveBeenCalled();
  });

  test('calls close (not destroy) when pendingCount>0 on logout', async () => {
    const mockStore = makeMockStore(3);
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { result, rerender } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      mockUseSession.mockReturnValue(makeSessionValue({ userId: null }));
      await rerender({});
    });

    await waitFor(() => expect(mockStore.close).toHaveBeenCalledTimes(1));
    expect(mockStore.destroy).not.toHaveBeenCalled();
  });

  test('sets ready=false and service=null after logout', async () => {
    const mockStore = makeMockStore(0);
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { result, rerender } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      mockUseSession.mockReturnValue(makeSessionValue({ userId: null }));
      await rerender({});
    });

    expect(result.current.ready).toBe(false);
    expect(result.current.service).toBeNull();
  });

  test('reads a fresh pendingCount when deciding destroy-vs-close', async () => {
    const mockStore = makeMockStore(0);
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { result, rerender } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    // Inject new pending count to simulate reviews added since last refresh
    mockStore.pendingCount.mockResolvedValue(5);

    await act(async () => {
      mockUseSession.mockReturnValue(makeSessionValue({ userId: null }));
      await rerender({});
    });

    await waitFor(() => expect(mockStore.close).toHaveBeenCalledTimes(1));
    expect(mockStore.destroy).not.toHaveBeenCalled();
    expect(mockStore.pendingCount).toHaveBeenCalled();
  });
});

describe('OfflineReviewProvider – account switch', () => {
  test('destroys old store and opens new store on user id change', async () => {
    const storeA = makeMockStore(0);
    const storeB = makeMockStore(0);
    mockOpenReviewStore
      .mockResolvedValueOnce(storeA)
      .mockResolvedValueOnce(storeB);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-A' }));

    const { result, rerender } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(mockOpenReviewStore).toHaveBeenCalledWith('user-A', expect.objectContaining({ request_retention: 0.9 }));

    // Switch to user-B directly (no intermediate null)
    await act(async () => {
      mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-B' }));
      await rerender({});
    });

    await waitFor(() => expect(mockOpenReviewStore).toHaveBeenCalledWith('user-B', expect.objectContaining({ request_retention: 0.9 })));
    await waitFor(() => expect(storeA.destroy).toHaveBeenCalledTimes(1));
  });
});

describe('OfflineReviewProvider – unmount', () => {
  test('calls close (not destroy) when the provider unmounts', async () => {
    const mockStore = makeMockStore(0);
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { result, unmount } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    await unmount();

    // On unmount: always close, never destroy
    await waitFor(() => expect(mockStore.close).toHaveBeenCalledTimes(1));
    expect(mockStore.destroy).not.toHaveBeenCalled();
  });

  test('does not call close or destroy when unmounting with no service', async () => {
    mockUseSession.mockReturnValue(makeSessionValue({ userId: null }));

    const { unmount } = await renderHook(() => useOfflineReview(), { wrapper });

    await unmount();

    expect(mockOpenReviewStore).not.toHaveBeenCalled();
  });
});

describe('OfflineReviewProvider – sync', () => {
  test('exposes sync, syncing, and lastSummary defaults before sync', async () => {
    const mockStore = makeMockStore();
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { result } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.syncing).toBe(false);
    expect(result.current.lastSummary).toBeNull();
    expect(typeof result.current.sync).toBe('function');
  });

  test('sync returns null when service is not ready', async () => {
    mockUseSession.mockReturnValue(makeSessionValue({ userId: null }));

    const { result } = await renderHook(() => useOfflineReview(), { wrapper });

    await expect(result.current.sync()).resolves.toBeNull();
  });
});

describe('OfflineReviewProvider – refreshPendingCount', () => {
  test('updates the exposed pendingCount state when called', async () => {
    const mockStore = makeMockStore(7);
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { result } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.pendingCount).toBe(0); // initial state

    await act(async () => {
      await result.current.refreshPendingCount();
    });

    expect(result.current.pendingCount).toBe(7);
  });

  test('reflects changes to pendingCount across multiple refreshes', async () => {
    const mockStore = makeMockStore(0);
    mockOpenReviewStore.mockResolvedValue(mockStore);
    mockUseSession.mockReturnValue(makeSessionValue({ userId: 'user-1' }));

    const { result } = await renderHook(() => useOfflineReview(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    mockStore.pendingCount.mockResolvedValue(3);
    await act(async () => {
      await result.current.refreshPendingCount();
    });
    expect(result.current.pendingCount).toBe(3);

    mockStore.pendingCount.mockResolvedValue(0);
    await act(async () => {
      await result.current.refreshPendingCount();
    });
    expect(result.current.pendingCount).toBe(0);
  });
});
