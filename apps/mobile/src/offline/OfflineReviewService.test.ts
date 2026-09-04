/**
 * Unit tests for OfflineReviewService.
 *
 * Uses a hand-written fake ReviewStore (no real SQLite) to test pure service logic.
 * The injected clock and uuid allow deterministic assertions on ReviewEvent fields.
 */

import { OfflineReviewService } from './OfflineReviewService';
import type { ReviewStore } from './ReviewStore';
import type { VersionedCard } from '@hanyu/data';
import { emptyState, schedulingParams } from '@hanyu/domain';

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

function makeFakeStore(overrides: Partial<ReviewStore> = {}): jest.Mocked<ReviewStore> {
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
    pendingCount: jest.fn().mockResolvedValue(0),
    setParams: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<ReviewStore>;
}

function makeService(overrides: {
  store?: ReviewStore;
  buildQueueOnline?: jest.Mock;
  now?: jest.Mock;
  uuid?: jest.Mock;
  params?: jest.Mock;
  cardOrder?: jest.Mock;
  revertReviewOnline?: jest.Mock;
} = {}) {
  return new OfflineReviewService({
    store: overrides.store ?? makeFakeStore(),
    buildQueueOnline:
      overrides.buildQueueOnline ?? jest.fn().mockResolvedValue({ cards: [] }),
    now:
      overrides.now ?? jest.fn().mockReturnValue(new Date('2026-07-31T10:00:00.000Z')),
    uuid: overrides.uuid ?? jest.fn().mockReturnValue('default-uuid'),
    params: overrides.params ?? jest.fn().mockReturnValue(schedulingParams({})),
    cardOrder: overrides.cardOrder ?? jest.fn().mockReturnValue('due'),
    revertReviewOnline:
      overrides.revertReviewOnline ??
      jest.fn().mockResolvedValue({ outcome: 'reverted', card: makeCard() }),
  });
}

// ---------------------------------------------------------------------------
// loadQueue
// ---------------------------------------------------------------------------

describe('loadQueue – cache-first load', () => {
  test('returns cached cards when online fetch throws (offline scenario)', async () => {
    const cachedCards = [makeCard({ id: 'cached-1' })];
    const store = makeFakeStore({
      getDueProjectedCards: jest.fn().mockResolvedValue(cachedCards),
    });
    const service = makeService({
      store,
      buildQueueOnline: jest.fn().mockRejectedValue(new Error('Network error')),
    });

    const result = await service.loadQueue();

    expect(result).toEqual(cachedCards);
    expect(store.cacheCards).not.toHaveBeenCalled();
  });

  test('never throws even when the online fetch rejects', async () => {
    const service = makeService({
      buildQueueOnline: jest.fn().mockRejectedValue(new Error('Offline')),
    });

    await expect(service.loadQueue()).resolves.toBeDefined();
  });

  test('does not present the review cache as another study mode after a mode-specific error', async () => {
    const cachedCards = [makeCard({ id: 'cached-review' })];
    const store = makeFakeStore({
      getDueProjectedCards: jest.fn().mockResolvedValue(cachedCards),
    });
    const service = makeService({
      store,
      buildQueueOnline: jest.fn().mockRejectedValue(new Error('active unit failed')),
    });

    await expect(service.loadQueue('recognition', null, 'learn')).resolves.toEqual([]);
    expect(service.lastQueueError).toBe('active unit failed');
  });

  test('reads cached cards with the injected clock timestamp', async () => {
    const fixedNow = new Date('2026-07-31T12:00:00.000Z');
    const now = jest.fn().mockReturnValue(fixedNow);
    const store = makeFakeStore({
      getDueProjectedCards: jest.fn().mockResolvedValue([]),
    });
    const service = makeService({
      store,
      now,
      buildQueueOnline: jest.fn().mockRejectedValue(new Error('offline')),
    });

    await service.loadQueue();

    expect(store.getDueProjectedCards).toHaveBeenCalledWith(fixedNow.toISOString(), 200);
  });
});

describe('loadQueue – online refresh', () => {
  test('caches online cards and returns the ordered server queue on success', async () => {
    const onlineCard = makeCard({ id: 'online-1', version: 3 });
    const store = makeFakeStore({
      getDueProjectedCards: jest.fn().mockResolvedValue([]),
    });
    const service = makeService({
      store,
      buildQueueOnline: jest.fn().mockResolvedValue({ cards: [onlineCard] }),
    });

    const result = await service.loadQueue();

    expect(store.cacheCards).toHaveBeenCalledWith([onlineCard]);
    expect(store.getDueProjectedCards).toHaveBeenCalledTimes(1);
    expect(result).toEqual([onlineCard]);
  });

  test('passes the focused deck to the server queue', async () => {
    const buildQueueOnline = jest.fn().mockResolvedValue({
      cards: [makeCard({ id: 'focused-card', version: 2 })],
      deck_size: 7,
    });
    const service = makeService({ buildQueueOnline });

    const result = await service.loadQueue('recognition', 'deck-1');

    expect(buildQueueOnline).toHaveBeenCalledWith({ skill: 'recognition', deckId: 'deck-1', mode: 'review' });
    expect(result).toHaveLength(1);
    expect(service.lastDeckSize).toBe(7);
  });

  test('no infiere el tamaño del mazo a partir de una cola vacía', async () => {
    const service = makeService({
      buildQueueOnline: jest.fn().mockResolvedValue({ cards: [] }),
    });

    await service.loadQueue('recognition', 'deck-1');

    expect(service.lastDeckSize).toBeNull();
  });

  test('passes a non-recognition skill to the online loader', async () => {
    const buildQueueOnline = jest.fn().mockResolvedValue({ cards: [] });
    const service = makeService({ buildQueueOnline });

    await service.loadQueue('recall', 'deck-1');

    expect(buildQueueOnline).toHaveBeenCalledWith({ skill: 'recall', deckId: 'deck-1', mode: 'review' });
  });

  test('passes the study mode to the online loader', async () => {
    const buildQueueOnline = jest.fn().mockResolvedValue({ cards: [] });
    const service = makeService({ buildQueueOnline });

    await service.loadQueue('recognition', 'deck-1', 'learn');

    expect(buildQueueOnline).toHaveBeenCalledWith({
      skill: 'recognition',
      deckId: 'deck-1',
      mode: 'learn',
    });
  });
});

describe('loadQueue – ordering', () => {
  test('uses the injected card-order strategy', async () => {
    const onlineCards = [
      makeCard({ id: 'rare', is_new: true, frequency: 900 }),
      makeCard({ id: 'common', is_new: true, frequency: 5 }),
    ];
    const store = makeFakeStore({
      getDueProjectedCards: jest.fn().mockResolvedValue([]),
    });
    const service = makeService({
      store,
      buildQueueOnline: jest.fn().mockResolvedValue({ cards: onlineCards }),
      cardOrder: jest.fn().mockReturnValue('frequency'),
    });

    const result = await service.loadQueue();

    expect(result.map((card) => card.id)).toEqual(['common', 'rare']);
  });
});

describe('loadQueue – version-validation gotcha', () => {
  test('falls back to cached when an online card has no version field', async () => {
    const cachedCards = [makeCard({ id: 'cached-1' })];
    const badCard = { id: 'bad-card', user_id: 'u', word_id: 1, ease_factor: 2.5 }; // no version
    const store = makeFakeStore({
      getDueProjectedCards: jest.fn().mockResolvedValue(cachedCards),
    });
    const service = makeService({
      store,
      buildQueueOnline: jest.fn().mockResolvedValue({ cards: [badCard] }),
    });

    const result = await service.loadQueue();

    expect(result).toEqual(cachedCards);
    expect(store.cacheCards).not.toHaveBeenCalled();
  });

  test('falls back to cached when an online card has null version', async () => {
    const cachedCards = [makeCard({ id: 'cached-1' })];
    const nullVersionCard = { ...makeCard(), version: null };
    const store = makeFakeStore({
      getDueProjectedCards: jest.fn().mockResolvedValue(cachedCards),
    });
    const service = makeService({
      store,
      buildQueueOnline: jest
        .fn()
        .mockResolvedValue({ cards: [nullVersionCard] }),
    });

    const result = await service.loadQueue();

    expect(result).toEqual(cachedCards);
    expect(store.cacheCards).not.toHaveBeenCalled();
  });

  test('proceeds normally when all online cards have valid versions', async () => {
    const validCard = makeCard({ id: 'valid-1', version: 7 });
    const store = makeFakeStore({
      getDueProjectedCards: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([validCard]),
    });
    const service = makeService({
      store,
      buildQueueOnline: jest.fn().mockResolvedValue({ cards: [validCard] }),
    });

    const result = await service.loadQueue();

    expect(store.cacheCards).toHaveBeenCalledWith([validCard]);
    expect(result).toEqual([validCard]);
  });
});

// ---------------------------------------------------------------------------
// rateCard
// ---------------------------------------------------------------------------

describe('rateCard – rating while offline', () => {
  test('returns the review id it generated', async () => {
    const card = makeCard();
    const service = makeService({ uuid: jest.fn().mockReturnValue('r1') });

    const result = await service.rateCard(card, 'easy', 1500);

    expect(result.reviewId).toBe('r1');
    expect(result.card.scheduling.reps).toBe(card.scheduling.reps + 1);
  });

  test('does not call buildQueueOnline during rating', async () => {
    const card = makeCard();
    const buildQueueOnline = jest.fn();
    const service = makeService({ buildQueueOnline });

    await service.rateCard(card, 'hard', null);

    expect(buildQueueOnline).not.toHaveBeenCalled();
  });

  test('stores the calculated state as one scheduling object', async () => {
    const card = makeCard();
    const service = makeService();

    const result = await service.rateCard(card, 'easy', null);

    expect(result.card.scheduling).toBeDefined();
    expect(result.card).not.toHaveProperty('interval');
    expect(result.card).not.toHaveProperty('next_review_at');
  });

  it('un Again devuelve la tarjeta dentro de la sesión', async () => {
    const service = makeService({ uuid: jest.fn().mockReturnValue('r1') });

    const { card: rated } = await service.rateCard(makeCard(), 'again', 1000);

    const minutes =
      (new Date(rated.scheduling.due).getTime() - Date.parse('2026-07-31T10:00:00.000Z')) / 60000;
    expect(minutes).toBeLessThan(60);
  });

  it('encola la valoración con la escala de FSRS, no con quality', async () => {
    const store = makeFakeStore();
    const service = makeService({ store, uuid: jest.fn().mockReturnValue('r1') });

    await service.rateCard(makeCard(), 'good', 1000);

    expect(store.enqueueAndProject).toHaveBeenCalledWith(
      expect.objectContaining({ grade: 3, skill: 'recognition' }),
      expect.anything(),
    );
  });
});

describe('undoRating', () => {
  test('discards a still-pending review without touching the network', async () => {
    const card = makeCard();
    const revertReviewOnline = jest.fn();
    const store = makeFakeStore({ discardPending: jest.fn().mockResolvedValue(card) });
    const service = makeService({ store, uuid: jest.fn().mockReturnValue('r1'), revertReviewOnline });

    const { reviewId } = await service.rateCard(card, 'easy', 1000);
    const restored = await service.undoRating(reviewId);

    expect(restored.scheduling.reps).toBe(card.scheduling.reps);
    expect(revertReviewOnline).not.toHaveBeenCalled();
  });

  test('reverts on the server when the review was already synced', async () => {
    const card = makeCard();
    const reverted = { ...card, version: card.version + 2 };
    const revertReviewOnline = jest
      .fn()
      .mockResolvedValue({ outcome: 'reverted', card: reverted });
    const store = makeFakeStore({ discardPending: jest.fn().mockResolvedValue(null) });
    const service = makeService({ store, revertReviewOnline });

    const restored = await service.undoRating('r1');

    expect(revertReviewOnline).toHaveBeenCalledWith('r1');
    expect(restored.version).toBe(card.version + 2);
  });

  test('refuses when the card moved on after the review', async () => {
    const card = makeCard();
    const revertReviewOnline = jest.fn().mockResolvedValue({ outcome: 'conflict', card });
    const store = makeFakeStore({ discardPending: jest.fn().mockResolvedValue(null) });
    const service = makeService({ store, revertReviewOnline });

    await expect(service.undoRating('r1')).rejects.toThrow(/reviewed again/i);
  });

  test('explains when the review to undo no longer exists', async () => {
    const revertReviewOnline = jest.fn().mockResolvedValue({ outcome: 'not_found', card: null });
    const store = makeFakeStore({ discardPending: jest.fn().mockResolvedValue(null) });
    const service = makeService({ store, revertReviewOnline });

    await expect(service.undoRating('missing-review')).rejects.toThrow(/could not be found/i);
  });

  test('explains when the review was already reverted', async () => {
    const revertReviewOnline = jest.fn().mockResolvedValue({ outcome: 'already_reverted', card: null });
    const store = makeFakeStore({ discardPending: jest.fn().mockResolvedValue(null) });
    const service = makeService({ store, revertReviewOnline });

    await expect(service.undoRating('already-undone')).rejects.toThrow(/already undone/i);
  });

  test('says plainly when an already-synced review has no connection', async () => {
    const revertReviewOnline = jest.fn().mockRejectedValue(new Error('Network request failed'));
    const store = makeFakeStore({ discardPending: jest.fn().mockResolvedValue(null) });
    const service = makeService({ store, revertReviewOnline });

    await expect(service.undoRating('r1')).rejects.toThrow(/already synced.*connection/i);
  });
});

describe('rateCard – UUID/time injection', () => {
  test('uses the injected clock for reviewed_at in the ReviewEvent', async () => {
    const fixedDate = new Date('2026-07-31T09:30:00.000Z');
    const now = jest.fn().mockReturnValue(fixedDate);
    const store = makeFakeStore();
    const service = makeService({ store, now });
    const card = makeCard();

    await service.rateCard(card, 'easy', 800);

    expect(store.enqueueAndProject).toHaveBeenCalledWith(
      expect.objectContaining({ reviewed_at: fixedDate.toISOString() }),
      expect.any(Object),
    );
  });

  test('uses the injected uuid for review_id in the ReviewEvent', async () => {
    const uuid = jest.fn().mockReturnValue('injected-uuid-99');
    const store = makeFakeStore();
    const service = makeService({ store, uuid });
    const card = makeCard();

    await service.rateCard(card, 'hard', null);

    expect(store.enqueueAndProject).toHaveBeenCalledWith(
      expect.objectContaining({ review_id: 'injected-uuid-99' }),
      expect.any(Object),
    );
  });

  test('sets expected_version from the card.version field', async () => {
    const card = makeCard({ version: 42 });
    const store = makeFakeStore();
    const service = makeService({ store });

    await service.rateCard(card, 'easy', null);

    expect(store.enqueueAndProject).toHaveBeenCalledWith(
      expect.objectContaining({ expected_version: 42, card_id: card.id }),
      expect.any(Object),
    );
  });

  test('passes the FSRS grade and time_ms through to the ReviewEvent', async () => {
    const card = makeCard();
    const store = makeFakeStore();
    const service = makeService({ store });

    await service.rateCard(card, 'hard', 3000);

    expect(store.enqueueAndProject).toHaveBeenCalledWith(
      expect.objectContaining({ grade: 2, skill: 'recognition', time_ms: 3000 }),
      expect.any(Object),
    );
  });

  test('uses the provider cache synchronously when parameters change', async () => {
    let current = schedulingParams({ request_retention: 0.9 });
    const params = jest.fn(() => current);
    const store = makeFakeStore();
    const service = makeService({ store, params });

    current = schedulingParams({ request_retention: 0.95 });

    await service.rateCard(makeCard(), 'good', 1000);

    expect(params).toHaveBeenCalledTimes(1);
    expect(store.setParams).toHaveBeenCalledWith(current);
  });
});

describe('rateCard – store failure before advance', () => {
  test('rejects with the store error when enqueueAndProject throws', async () => {
    const storeError = new Error('DB write failed – disk full');
    const store = makeFakeStore({
      enqueueAndProject: jest.fn().mockRejectedValue(storeError),
    });
    const service = makeService({ store });
    const card = makeCard();

    await expect(service.rateCard(card, 'easy', null)).rejects.toThrow(
      'DB write failed – disk full',
    );
  });

  test('never resolves before enqueueAndProject resolves', async () => {
    let resolveEnqueue!: () => void;
    const enqueuePromise = new Promise<void>((res) => {
      resolveEnqueue = res;
    });
    const store = makeFakeStore({
      enqueueAndProject: jest.fn().mockReturnValue(enqueuePromise),
    });
    const service = makeService({ store });
    const card = makeCard();

    let resolved = false;
    const ratePromise = service.rateCard(card, 'easy', null).then((r) => {
      resolved = true;
      return r;
    });

    // Yield to microtasks – enqueue hasn't resolved yet
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Now resolve the enqueue
    resolveEnqueue();
    await ratePromise;
    expect(resolved).toBe(true);
  });
});

describe('rateCard – synchronous double-tap guard', () => {
  test('only one enqueueAndProject when two overlapping calls are fired', async () => {
    const store = makeFakeStore();
    const service = makeService({ store });
    const card = makeCard();

    // Fire both without awaiting the first — the guard must fire synchronously
    const promise1 = service.rateCard(card, 'easy', null);
    const promise2 = service.rateCard(card, 'good', null);

    await expect(promise2).rejects.toThrow(
      'A rating for this card is already in progress',
    );
    await expect(promise1).resolves.toBeDefined();
    expect(store.enqueueAndProject).toHaveBeenCalledTimes(1);
  });

  test('allows a subsequent call for the same card once the first completes', async () => {
    const service = makeService();
    const card = makeCard();

    await service.rateCard(card, 'easy', null);
    await expect(service.rateCard(card, 'good', null)).resolves.toBeDefined();
  });

  test('releases the guard in the finally block even when the store throws', async () => {
    const store = makeFakeStore({
      enqueueAndProject: jest
        .fn()
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue(undefined),
    });
    const service = makeService({ store });
    const card = makeCard();

    await expect(service.rateCard(card, 'easy', null)).rejects.toThrow('DB error');
    // Guard must be released — the next call for the same card should not hit the guard
    await expect(service.rateCard(card, 'easy', null)).resolves.toBeDefined();
  });

  test('guard is per-card-id: concurrent calls for different cards both proceed', async () => {
    const store = makeFakeStore();
    const service = makeService({ store });
    const cardA = makeCard({ id: 'card-A' });
    const cardB = makeCard({ id: 'card-B' });

    const promiseA = service.rateCard(cardA, 'easy', null);
    const promiseB = service.rateCard(cardB, 'good', null); // different id — no guard

    await expect(promiseA).resolves.toBeDefined();
    await expect(promiseB).resolves.toBeDefined();
    expect(store.enqueueAndProject).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// pendingCount / close / destroy delegation
// ---------------------------------------------------------------------------

describe('delegation methods', () => {
  test('pendingCount delegates to store.pendingCount', async () => {
    const store = makeFakeStore({ pendingCount: jest.fn().mockResolvedValue(7) });
    const service = makeService({ store });
    expect(await service.pendingCount()).toBe(7);
  });

  test('close delegates to store.close', async () => {
    const store = makeFakeStore();
    const service = makeService({ store });
    await service.close();
    expect(store.close).toHaveBeenCalledTimes(1);
  });

  test('destroy delegates to store.destroy', async () => {
    const store = makeFakeStore();
    const service = makeService({ store });
    await service.destroy();
    expect(store.destroy).toHaveBeenCalledTimes(1);
  });
});
