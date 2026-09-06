/**
 * Unit tests for ReviewSyncEngine – idempotent FIFO sync worker.
 *
 * Uses a hand-written fake ReviewStore and injected reviewCardEvent / sleep.
 * No real SQLite or network.
 */

import type { ReviewEvent, ReviewSyncResult, VersionedCard } from '@hanyu/data';
import { emptyState } from '@hanyu/domain';
import { SYNC_BACKOFF_DELAYS_MS } from './backoff';
import { ReviewSyncEngine } from './ReviewSyncEngine';
import type { QueuedReviewEvent, ReviewStore } from './ReviewStore';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<VersionedCard> = {}): VersionedCard {
  return {
    id: 'card-1',
    user_id: 'user-test',
    word_id: 1,
    skill: 'recognition',
    is_new: false,
    scheduling: emptyState(new Date('2026-07-31T10:00:00.000Z')),
    version: 1,
    ...overrides,
  };
}

let reviewSeq = 0;

function makeQueuedEvent(
  overrides: Partial<ReviewEvent> & { queue_sequence?: number; queue_state?: QueuedReviewEvent['queue_state'] } = {},
): QueuedReviewEvent {
  reviewSeq += 1;
  return {
    review_id: overrides.review_id ?? `rev-${reviewSeq}`,
    card_id: overrides.card_id ?? 'card-1',
    grade: overrides.grade ?? 4,
    skill: overrides.skill ?? 'recognition',
    time_ms: overrides.time_ms ?? 1000,
    reviewed_at: overrides.reviewed_at ?? '2026-07-31T10:00:00.000Z',
    expected_version: overrides.expected_version ?? 1,
    state: overrides.state ?? emptyState(new Date('2026-07-31T10:00:00.000Z')),
    prior: overrides.prior ?? emptyState(new Date('2026-07-31T10:00:00.000Z')),
    queue_sequence: overrides.queue_sequence ?? reviewSeq,
    queue_state: overrides.queue_state ?? 'pending',
    attempt_count: 0,
    last_error: null,
  };
}

function toReviewEvent(ev: QueuedReviewEvent): ReviewEvent {
  return {
    card_id: ev.card_id,
    grade: ev.grade,
    skill: ev.skill,
    time_ms: ev.time_ms,
    review_id: ev.review_id,
    reviewed_at: ev.reviewed_at,
    expected_version: ev.expected_version,
    state: ev.state,
    prior: ev.prior,
  };
}

function makeFakeStore(overrides: Partial<ReviewStore> = {}): jest.Mocked<ReviewStore> {
  return {
    cacheCards: jest.fn().mockResolvedValue(undefined),
    getDueProjectedCards: jest.fn().mockResolvedValue([]),
    enqueueAndProject: jest.fn().mockResolvedValue(undefined),
    listPending: jest.fn().mockResolvedValue([]),
    acknowledge: jest.fn().mockResolvedValue(undefined),
    rebase: jest.fn().mockResolvedValue([]),
    markPermanentError: jest.fn().mockResolvedValue(undefined),
    pendingCount: jest.fn().mockResolvedValue(0),
    close: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    markSyncing: jest.fn().mockResolvedValue(true),
    markPending: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<ReviewStore>;
}

function makeEngine(opts: {
  store?: ReviewStore;
  reviewCardEvent?: jest.Mock;
  sleep?: jest.Mock;
}) {
  const store = opts.store ?? makeFakeStore();
  const reviewCardEvent = opts.reviewCardEvent ?? jest.fn();
  const sleep = opts.sleep ?? jest.fn().mockResolvedValue(undefined);
  const engine = new ReviewSyncEngine({ store, reviewCardEvent, sleep });
  return { engine, store, reviewCardEvent, sleep };
}

function makeSyncResult(
  outcome: ReviewSyncResult['outcome'],
  card: VersionedCard,
): ReviewSyncResult {
  return { outcome, card };
}

function makeError(message: string, status?: number): Error & { status?: number } {
  const err = new Error(message) as Error & { status?: number };
  if (status !== undefined) err.status = status;
  return err;
}

beforeEach(() => {
  reviewSeq = 0;
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Success / idempotency
// ---------------------------------------------------------------------------

describe('ReviewSyncEngine – applied', () => {
  test('acknowledges a single pending event and returns applied=1', async () => {
    const ev = makeQueuedEvent();
    const serverCard = makeCard({ version: 2 });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev]),
      pendingCount: jest.fn().mockResolvedValue(0),
    });
    const reviewCardEvent = jest
      .fn()
      .mockResolvedValue(makeSyncResult('applied', serverCard));
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(summary).toEqual({ applied: 1, duplicates: 0, conflicts: 0, remaining: 0 });
    expect(reviewCardEvent).toHaveBeenCalledWith(toReviewEvent(ev));
    expect(store.acknowledge).toHaveBeenCalledWith(ev.review_id, serverCard);
  });
});

describe('ReviewSyncEngine – duplicate', () => {
  test('acknowledges on duplicate outcome', async () => {
    const ev = makeQueuedEvent();
    const serverCard = makeCard({ version: 2 });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev]),
      pendingCount: jest.fn().mockResolvedValue(0),
    });
    const reviewCardEvent = jest
      .fn()
      .mockResolvedValue(makeSyncResult('duplicate', serverCard));
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(summary).toEqual({ applied: 0, duplicates: 1, conflicts: 0, remaining: 0 });
    expect(store.acknowledge).toHaveBeenCalledWith(ev.review_id, serverCard);
  });
});

describe('ReviewSyncEngine – timeout then duplicate', () => {
  test('retries after transient timeout and acknowledges on duplicate', async () => {
    jest.useFakeTimers();
    const ev = makeQueuedEvent();
    const serverCard = makeCard({ version: 2 });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev]),
      pendingCount: jest.fn().mockResolvedValue(0),
    });
    const reviewCardEvent = jest
      .fn()
      .mockRejectedValueOnce(makeError('Request timeout', undefined))
      .mockResolvedValueOnce(makeSyncResult('duplicate', serverCard));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const { engine } = makeEngine({ store, reviewCardEvent, sleep });

    const syncPromise = engine.sync();
    await jest.runAllTimersAsync();
    const summary = await syncPromise;

    expect(summary).toEqual({ applied: 0, duplicates: 1, conflicts: 0, remaining: 0 });
    expect(reviewCardEvent).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(SYNC_BACKOFF_DELAYS_MS[0]);
    expect(store.acknowledge).toHaveBeenCalledWith(ev.review_id, serverCard);
  });
});

describe('ReviewSyncEngine – multiple cards', () => {
  test('processes two cards in FIFO order', async () => {
    const ev1 = makeQueuedEvent({ card_id: 'card-a', queue_sequence: 1 });
    const ev2 = makeQueuedEvent({ card_id: 'card-b', queue_sequence: 2 });
    const cardA = makeCard({ id: 'card-a', version: 2 });
    const cardB = makeCard({ id: 'card-b', version: 3 });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev1, ev2]),
      pendingCount: jest.fn().mockResolvedValue(0),
    });
    const reviewCardEvent = jest
      .fn()
      .mockResolvedValueOnce(makeSyncResult('applied', cardA))
      .mockResolvedValueOnce(makeSyncResult('applied', cardB));
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(summary).toEqual({ applied: 2, duplicates: 0, conflicts: 0, remaining: 0 });
    expect(reviewCardEvent).toHaveBeenNthCalledWith(1, toReviewEvent(ev1));
    expect(reviewCardEvent).toHaveBeenNthCalledWith(2, toReviewEvent(ev2));
    expect(store.acknowledge).toHaveBeenCalledTimes(2);
  });
});

describe('ReviewSyncEngine – two reviews on one card', () => {
  test('processes both events sequentially when both succeed', async () => {
    const ev1 = makeQueuedEvent({
      card_id: 'card-1',
      queue_sequence: 1,
      expected_version: 1,
    });
    const ev2 = makeQueuedEvent({
      card_id: 'card-1',
      queue_sequence: 2,
      expected_version: 2,
    });
    const cardV2 = makeCard({ id: 'card-1', version: 2 });
    const cardV3 = makeCard({ id: 'card-1', version: 3 });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev1, ev2]),
      pendingCount: jest.fn().mockResolvedValue(0),
    });
    const reviewCardEvent = jest
      .fn()
      .mockResolvedValueOnce(makeSyncResult('applied', cardV2))
      .mockResolvedValueOnce(makeSyncResult('applied', cardV3));
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(summary).toEqual({ applied: 2, duplicates: 0, conflicts: 0, remaining: 0 });
    expect(store.acknowledge).toHaveBeenNthCalledWith(1, ev1.review_id, cardV2);
    expect(store.acknowledge).toHaveBeenNthCalledWith(2, ev2.review_id, cardV3);
  });
});

describe('ReviewSyncEngine – single-flight', () => {
  test('concurrent sync() calls share one in-flight promise', async () => {
    const ev = makeQueuedEvent();
    const serverCard = makeCard({ version: 2 });
    let resolveRpc!: (value: ReviewSyncResult) => void;
    const rpcPromise = new Promise<ReviewSyncResult>((resolve) => {
      resolveRpc = resolve;
    });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev]),
      pendingCount: jest.fn().mockResolvedValue(0),
    });
    const reviewCardEvent = jest.fn().mockReturnValue(rpcPromise);
    const { engine } = makeEngine({ store, reviewCardEvent });

    const p1 = engine.sync();
    const p2 = engine.sync();

    expect(p1).toBe(p2);
    resolveRpc!(makeSyncResult('applied', serverCard));

    const [s1, s2] = await Promise.all([p1, p2]);
    expect(s1).toEqual(s2);
    expect(reviewCardEvent).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewSyncEngine – claim before submit', () => {
  test('marks the event syncing before the network request starts', async () => {
    const ev = makeQueuedEvent();
    const serverCard = makeCard({ version: 2 });
    let resolveRpc!: (value: ReviewSyncResult) => void;
    const rpcPromise = new Promise<ReviewSyncResult>((resolve) => {
      resolveRpc = resolve;
    });
    const markSyncing = jest.fn().mockResolvedValue(true);
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev]),
      pendingCount: jest.fn().mockResolvedValue(0),
      markSyncing,
    });
    const reviewCardEvent = jest.fn().mockReturnValue(rpcPromise);
    const { engine } = makeEngine({ store, reviewCardEvent });

    const syncPromise = engine.sync();
    await Promise.resolve();
    await Promise.resolve();

    expect(markSyncing).toHaveBeenCalledWith(ev.review_id);
    expect(markSyncing.mock.invocationCallOrder[0]).toBeLessThan(
      reviewCardEvent.mock.invocationCallOrder[0],
    );

    resolveRpc(makeSyncResult('applied', serverCard));
    await syncPromise;
  });
});

describe('ReviewSyncEngine – pending count', () => {
  test('remaining reflects pending events left after sync', async () => {
    const ev1 = makeQueuedEvent({ card_id: 'card-a', queue_sequence: 1 });
    const ev2 = makeQueuedEvent({ card_id: 'card-b', queue_sequence: 2 });
    const cardA = makeCard({ id: 'card-a', version: 2 });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev1, ev2]),
      pendingCount: jest.fn().mockResolvedValue(1),
    });
    const networkError = makeError('Network error');
    const reviewCardEvent = jest
      .fn()
      .mockResolvedValueOnce(makeSyncResult('applied', cardA))
      .mockRejectedValue(networkError);
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(summary.applied).toBe(1);
    expect(summary.remaining).toBe(1);
    expect(store.acknowledge).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

describe('ReviewSyncEngine – transient retry', () => {
  test('retries with backoff and leaves event pending when retries exhausted', async () => {
    jest.useFakeTimers();
    const ev = makeQueuedEvent();
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev]),
      pendingCount: jest.fn().mockResolvedValue(1),
    });
    const reviewCardEvent = jest.fn().mockRejectedValue(makeError('fetch failed'));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const { engine } = makeEngine({ store, reviewCardEvent, sleep });

    const syncPromise = engine.sync();
    await jest.runAllTimersAsync();
    const summary = await syncPromise;

    expect(reviewCardEvent).toHaveBeenCalledTimes(SYNC_BACKOFF_DELAYS_MS.length + 1);
    expect(sleep).toHaveBeenCalledTimes(SYNC_BACKOFF_DELAYS_MS.length);
    expect(store.acknowledge).not.toHaveBeenCalled();
    expect(summary.remaining).toBe(1);
  });
});

describe('ReviewSyncEngine – auth stop', () => {
  test('stops the entire run on 401 without processing later events', async () => {
    const ev1 = makeQueuedEvent({ card_id: 'card-a', queue_sequence: 1 });
    const ev2 = makeQueuedEvent({ card_id: 'card-b', queue_sequence: 2 });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev1, ev2]),
      pendingCount: jest.fn().mockResolvedValue(2),
    });
    const reviewCardEvent = jest.fn().mockRejectedValue(makeError('Unauthorized', 401));
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(reviewCardEvent).toHaveBeenCalledTimes(1);
    expect(store.acknowledge).not.toHaveBeenCalled();
    expect(summary.remaining).toBe(2);
  });
});

describe('ReviewSyncEngine – permanent error', () => {
  test('marks 404 as permanent_error and continues with other events', async () => {
    const ev1 = makeQueuedEvent({ card_id: 'card-a', queue_sequence: 1 });
    const ev2 = makeQueuedEvent({ card_id: 'card-b', queue_sequence: 2 });
    const cardB = makeCard({ id: 'card-b', version: 2 });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev1, ev2]),
      pendingCount: jest.fn().mockResolvedValue(0),
    });
    const reviewCardEvent = jest
      .fn()
      .mockRejectedValueOnce(makeError('Card not found', 404))
      .mockResolvedValueOnce(makeSyncResult('applied', cardB));
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(store.markPermanentError).toHaveBeenCalledWith(
      ev1.review_id,
      expect.stringContaining('not found'),
    );
    expect(store.acknowledge).toHaveBeenCalledWith(ev2.review_id, cardB);
    expect(summary.applied).toBe(1);
  });
});

describe('ReviewSyncEngine – conflict', () => {
  test('rebases the queue onto the server card and retries the conflicted event', async () => {
    const ev1 = makeQueuedEvent({ card_id: 'card-1', queue_sequence: 1, expected_version: 1 });
    const ev2 = makeQueuedEvent({ card_id: 'card-1', queue_sequence: 2, expected_version: 1 });
    const serverCard = makeCard({ id: 'card-1', version: 5 });
    const appliedCard = makeCard({ id: 'card-1', version: 6 });
    const rebased = [
      { ...ev1, expected_version: 5 },
      { ...ev2, expected_version: 6 },
    ];
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev1, ev2]),
      rebase: jest.fn().mockResolvedValue(rebased),
      pendingCount: jest.fn().mockResolvedValue(2),
    });
    const reviewCardEvent = jest
      .fn()
      .mockResolvedValueOnce(makeSyncResult('conflict', serverCard))
      .mockResolvedValueOnce(makeSyncResult('applied', appliedCard))
      .mockResolvedValueOnce(makeSyncResult('applied', appliedCard));
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(store.rebase).toHaveBeenCalledTimes(1);
    expect(store.rebase).toHaveBeenCalledWith(serverCard, [ev1, ev2]);
    // El evento en conflicto se reintenta ya reanclado, y el siguiente de la
    // misma tarjeta sale con la versión reescrita en vez de saltarse.
    expect(reviewCardEvent).toHaveBeenNthCalledWith(2, toReviewEvent(rebased[0]));
    expect(reviewCardEvent).toHaveBeenNthCalledWith(3, toReviewEvent(rebased[1]));
    expect(summary).toEqual({ applied: 2, duplicates: 0, conflicts: 1, remaining: 0 });
  });

  test('gives up on a card whose rebased retry conflicts again, without looping', async () => {
    const ev1 = makeQueuedEvent({ card_id: 'card-1', queue_sequence: 1, expected_version: 1 });
    const ev2 = makeQueuedEvent({ card_id: 'card-1', queue_sequence: 2, expected_version: 1 });
    const ev3 = makeQueuedEvent({ card_id: 'card-2', queue_sequence: 3 });
    const serverCard = makeCard({ id: 'card-1', version: 5 });
    const card2 = makeCard({ id: 'card-2', version: 2 });
    const rebased = [
      { ...ev1, expected_version: 5 },
      { ...ev2, expected_version: 6 },
    ];
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev1, ev2, ev3]),
      rebase: jest.fn().mockResolvedValue(rebased),
      pendingCount: jest.fn().mockResolvedValue(2),
    });
    const reviewCardEvent = jest
      .fn()
      .mockResolvedValueOnce(makeSyncResult('conflict', serverCard))
      .mockResolvedValueOnce(makeSyncResult('conflict', serverCard))
      .mockResolvedValueOnce(makeSyncResult('applied', card2));
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(store.rebase).toHaveBeenCalledTimes(1);
    expect(reviewCardEvent).toHaveBeenCalledTimes(3);
    expect(reviewCardEvent).toHaveBeenNthCalledWith(3, toReviewEvent(ev3));
    expect(store.markPending).toHaveBeenCalledWith(ev1.review_id);
    expect(store.acknowledge).toHaveBeenCalledTimes(1);
    expect(store.acknowledge).toHaveBeenCalledWith(ev3.review_id, card2);
    expect(summary).toEqual({ applied: 1, duplicates: 0, conflicts: 2, remaining: 2 });
  });

  test('does not rebase a card that never conflicted', async () => {
    const ev = makeQueuedEvent({ card_id: 'card-1', queue_sequence: 1 });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev]),
      pendingCount: jest.fn().mockResolvedValue(1),
    });
    const reviewCardEvent = jest.fn().mockResolvedValue(makeSyncResult('applied', makeCard()));
    const { engine } = makeEngine({ store, reviewCardEvent });

    await engine.sync();

    expect(store.rebase).not.toHaveBeenCalled();
  });
});

describe('ReviewSyncEngine – skips non-pending', () => {
  test('does not submit permanent_error events', async () => {
    const ev = makeQueuedEvent({ queue_state: 'permanent_error' });
    const store = makeFakeStore({
      listPending: jest.fn().mockResolvedValue([ev]),
      pendingCount: jest.fn().mockResolvedValue(1),
    });
    const reviewCardEvent = jest.fn();
    const { engine } = makeEngine({ store, reviewCardEvent });

    const summary = await engine.sync();

    expect(reviewCardEvent).not.toHaveBeenCalled();
    expect(summary).toEqual({ applied: 0, duplicates: 0, conflicts: 0, remaining: 0 });
  });
});
