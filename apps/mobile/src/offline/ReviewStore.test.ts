/**
 * ReviewStore tests using node:sqlite (Node 22 built-in) as the in-memory SQL backend.
 *
 * expo-sqlite cannot run under Jest (no native module), so ReviewStore.ts accepts an
 * injectable DbHandle interface. Here we back that interface with a real in-memory SQLite
 * database via node:sqlite – giving us genuine constraint enforcement and transactional
 * rollback without any mocking.
 *
 * Node will print "ExperimentalWarning: SQLite is an experimental feature" to stderr the
 * first time this module is loaded; that is harmless and does not indicate a test failure.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => any;
};

import { applySchema } from './schema';
import { ReviewStoreImpl } from './ReviewStore';
import type { DbHandle, ReviewStore } from './ReviewStore';
import type { VersionedCard, ReviewEvent } from '@hanyu/data';

// ---------------------------------------------------------------------------
// Test adapter: wraps a synchronous node:sqlite DatabaseSync instance
// to satisfy the async DbHandle interface.
// ---------------------------------------------------------------------------
function makeTestHandle(nativeDb: any): DbHandle {
  return {
    execAsync: (sql: string) => {
      nativeDb.exec(sql);
      return Promise.resolve();
    },
    runAsync: (sql: string, params: unknown[]) => {
      nativeDb.prepare(sql).run(...params);
      return Promise.resolve();
    },
    getAllAsync: <T>(sql: string, params: unknown[]) => {
      const rows: T[] = nativeDb.prepare(sql).all(...params);
      return Promise.resolve(rows);
    },
    getFirstAsync: <T>(sql: string, params: unknown[]) => {
      const row: T | undefined = nativeDb.prepare(sql).get(...params);
      return Promise.resolve(row !== undefined ? row : null);
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      nativeDb.exec('BEGIN');
      try {
        await fn();
        nativeDb.exec('COMMIT');
      } catch (err) {
        nativeDb.exec('ROLLBACK');
        throw err;
      }
    },
    closeAsync: () => {
      nativeDb.close();
      return Promise.resolve();
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers to build minimal VersionedCard / ReviewEvent fixtures
// ---------------------------------------------------------------------------
let cardSeq = 0;
let reviewSeq = 0;

function makeCard(overrides: Partial<VersionedCard> = {}): VersionedCard {
  cardSeq += 1;
  const id = overrides.id ?? `card-${cardSeq}`;
  return {
    id,
    user_id: 'user-test',
    word_id: cardSeq,
    ease_factor: 2.5,
    interval: 1,
    interval_days: 1,
    repetitions: 0,
    next_review: '2026-01-01T00:00:00.000Z',
    next_review_at: '2026-01-01T00:00:00.000Z',
    last_review: null,
    last_reviewed_at: null,
    status: 'new',
    version: 1,
    ...overrides,
  };
}

function makeEvent(
  cardId: string,
  quality: number,
  overrides: Partial<ReviewEvent> = {},
): ReviewEvent {
  reviewSeq += 1;
  return {
    review_id: `rev-${reviewSeq}`,
    card_id: cardId,
    quality,
    time_ms: 1000,
    reviewed_at: '2026-07-31T10:00:00.000Z',
    expected_version: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Per-test store factory (each test gets a fresh in-memory DB)
// ---------------------------------------------------------------------------
async function createStore(): Promise<{ store: ReviewStore; handle: DbHandle; destroyFn: jest.Mock }> {
  const nativeDb = new DatabaseSync(':memory:');
  const handle = makeTestHandle(nativeDb);
  await applySchema(handle);
  const destroyFn = jest.fn().mockResolvedValue(undefined);
  const store = new ReviewStoreImpl(handle, destroyFn);
  return { store, handle, destroyFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('schema migration', () => {
  test('fresh open sets PRAGMA user_version to 1 and creates all three tables', async () => {
    const nativeDb = new DatabaseSync(':memory:');
    const handle = makeTestHandle(nativeDb);

    // Before migration
    const before = await handle.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(before?.user_version).toBe(0);

    await applySchema(handle);

    // After migration
    const after = await handle.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(after?.user_version).toBe(1);

    // All three tables exist
    const tables = await handle.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      [],
    );
    const names = tables.map(t => t.name).sort();
    expect(names).toEqual(['cached_cards', 'pending_reviews', 'sync_meta']);
  });

  test('applySchema is idempotent (calling twice does not break)', async () => {
    const nativeDb = new DatabaseSync(':memory:');
    const handle = makeTestHandle(nativeDb);
    await applySchema(handle);
    await expect(applySchema(handle)).resolves.not.toThrow();
    const row = await handle.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(row?.user_version).toBe(1);
  });
});

describe('cacheCards', () => {
  test('upserts cards into cached_cards', async () => {
    const { store } = await createStore();
    const card = makeCard({ next_review_at: '2026-08-01T00:00:00.000Z' });
    await store.cacheCards([card]);

    const due = await store.getDueProjectedCards('2026-08-02T00:00:00.000Z', 10);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe(card.id);
  });

  test('updates an existing card on second cacheCards call', async () => {
    const { store } = await createStore();
    const card = makeCard({ next_review_at: '2026-08-01T00:00:00.000Z' });
    await store.cacheCards([card]);

    const updated = { ...card, version: 2, interval_days: 7 };
    await store.cacheCards([updated]);

    const due = await store.getDueProjectedCards('2026-08-02T00:00:00.000Z', 10);
    expect(due).toHaveLength(1);
    expect(due[0].interval_days).toBe(7);
  });

  test('preserves pending-event projection when caching a new server card', async () => {
    const { store } = await createStore();
    const card = makeCard({
      next_review_at: '2026-07-30T00:00:00.000Z',
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 0,
      status: 'new',
    });

    // Cache the initial server card
    await store.cacheCards([card]);

    // Enqueue a quality-5 review so there is a pending event
    const event = makeEvent(card.id, 5);
    const projectedAfterReview = makeCard({
      id: card.id,
      next_review_at: '2099-12-31T00:00:00.000Z', // far future after SM2
    });
    await store.enqueueAndProject(event, projectedAfterReview);

    // Now the server sends us a refreshed version of the card (without the pending review applied)
    const serverRefresh = { ...card, version: 2 };
    await store.cacheCards([serverRefresh]);

    // The projection must NOT regress to the raw server state;
    // it must reflect the still-pending event replayed on top of serverRefresh.
    const due = await store.getDueProjectedCards('2099-12-31T00:00:00.000Z', 10);
    const projectedCard = due.find(c => c.id === card.id);
    expect(projectedCard).toBeDefined();
    // The projection must be > serverRefresh.next_review_at (pending event pushed it forward)
    expect(projectedCard!.next_review_at > serverRefresh.next_review_at).toBe(true);
  });
});

describe('enqueueAndProject', () => {
  test('inserts into both pending_reviews and updates cached_cards', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);

    const event = makeEvent(card.id, 4);
    const projected = { ...card, interval_days: 6, next_review_at: '2099-01-01T00:00:00.000Z' };
    await store.enqueueAndProject(event, projected);

    expect(await store.pendingCount()).toBe(1);
    const due = await store.getDueProjectedCards('2099-01-02T00:00:00.000Z', 10);
    expect(due[0].interval_days).toBe(6);
  });

  test('rolls back both tables atomically on constraint violation', async () => {
    const { store } = await createStore();
    const card = makeCard({ next_review_at: '2026-07-30T00:00:00.000Z', interval_days: 1 });
    await store.cacheCards([card]);

    // quality = 10 violates the CHECK constraint (quality between 0 and 5)
    const badEvent = makeEvent(card.id, 10);
    const projected = { ...card, interval_days: 99 };

    await expect(store.enqueueAndProject(badEvent, projected)).rejects.toThrow();

    // pending_reviews must be empty (no partial insert)
    expect(await store.pendingCount()).toBe(0);

    // cached_cards projection must not have been updated to interval_days=99
    const due = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    expect(due[0].interval_days).toBe(1);
  });
});

describe('listPending', () => {
  test('returns events ordered by queue_sequence ascending', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);

    const e1 = makeEvent(card.id, 3);
    const p1 = { ...card, interval_days: 1 };
    await store.enqueueAndProject(e1, p1);

    const e2 = makeEvent(card.id, 5);
    const p2 = { ...card, interval_days: 6 };
    await store.enqueueAndProject(e2, p2);

    const pending = await store.listPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].review_id).toBe(e1.review_id);
    expect(pending[1].review_id).toBe(e2.review_id);
    expect(pending[0].queue_sequence).toBeLessThan(pending[1].queue_sequence);
  });

  test('includes state, attempt_count, and last_error fields', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);
    const event = makeEvent(card.id, 4);
    await store.enqueueAndProject(event, card);

    const [item] = await store.listPending();
    expect(item.state).toBe('pending');
    expect(item.attempt_count).toBe(0);
    expect(item.last_error).toBeNull();
  });
});

describe('acknowledge', () => {
  test('removes acknowledged event and updates cached card to server state', async () => {
    const { store } = await createStore();
    const card = makeCard({ interval_days: 1 });
    await store.cacheCards([card]);

    const event = makeEvent(card.id, 5);
    const projected = { ...card, interval_days: 6 };
    await store.enqueueAndProject(event, projected);

    const serverCard = { ...card, version: 2, interval_days: 6 };
    await store.acknowledge(event.review_id, serverCard);

    expect(await store.pendingCount()).toBe(0);
    const due = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    expect(due[0].interval_days).toBe(6);
    expect(due[0].version).toBe(2);
  });

  test('replays remaining pending events on top of server card (no regression)', async () => {
    const { store } = await createStore();
    const card = makeCard({
      next_review_at: '2026-01-01T00:00:00.000Z',
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 0,
      status: 'new',
    });
    await store.cacheCards([card]);

    // Two back-to-back reviews
    const e1 = makeEvent(card.id, 5, { reviewed_at: '2026-07-31T10:00:00.000Z' });
    const p1 = { ...card, interval_days: 1 }; // interim projection
    await store.enqueueAndProject(e1, p1);

    const e2 = makeEvent(card.id, 4, { reviewed_at: '2026-07-31T11:00:00.000Z', expected_version: 2 });
    const p2 = { ...card, interval_days: 6 }; // interim projection
    await store.enqueueAndProject(e2, p2);

    expect(await store.pendingCount()).toBe(2);

    // Server acknowledges e1 with version 2
    const serverCardV2 = { ...card, version: 2, interval_days: 1, repetitions: 1, status: 'learning' as const };
    await store.acknowledge(e1.review_id, serverCardV2);

    // e2 must still be pending; projection = applySm2(serverCardV2, e2)
    expect(await store.pendingCount()).toBe(1);
    const remaining = await store.listPending();
    expect(remaining[0].review_id).toBe(e2.review_id);

    // The projection stored in cached_cards must reflect e2 replayed on serverCardV2,
    // NOT just the raw serverCardV2 state
    const due = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    const proj = due.find(c => c.id === card.id);
    expect(proj).toBeDefined();
    expect(proj!.interval_days).toBeGreaterThan(serverCardV2.interval_days);
  });
});

describe('markPermanentError', () => {
  test('sets state to permanent_error, stores message, increments attempt_count', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);
    const event = makeEvent(card.id, 4);
    await store.enqueueAndProject(event, card);

    await store.markPermanentError(event.review_id, 'version conflict');

    const [item] = await store.listPending();
    expect(item.state).toBe('permanent_error');
    expect(item.last_error).toBe('version conflict');
    expect(item.attempt_count).toBe(1);
  });
});

describe('rebase', () => {
  test('updates cached card and rewrites expected_version on pending events', async () => {
    const { store } = await createStore();
    const card = makeCard({ version: 1, interval_days: 1 });
    await store.cacheCards([card]);

    const event = makeEvent(card.id, 5, { expected_version: 1 });
    await store.enqueueAndProject(event, { ...card, interval_days: 6 });

    const rebasedCard = { ...card, version: 3, interval_days: 10 };
    const pending = await store.listPending();
    const rebasedEvents = pending.map(e => ({ ...e, expected_version: 3 }));

    await store.rebase(rebasedCard, rebasedEvents);

    // cached_cards must reflect the rebased card
    const due = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    expect(due[0].version).toBe(3);
    expect(due[0].interval_days).toBe(10);

    // pending_reviews must have updated expected_version
    const afterRebase = await store.listPending();
    expect(afterRebase[0].expected_version).toBe(3);
  });

  test('does not insert or delete rows in pending_reviews', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);
    const event = makeEvent(card.id, 4);
    await store.enqueueAndProject(event, card);

    const before = await store.pendingCount();
    const pending = await store.listPending();
    await store.rebase({ ...card, version: 2 }, pending);
    const after = await store.pendingCount();

    expect(after).toBe(before);
  });
});

describe('pendingCount', () => {
  test('counts all rows including permanent_error', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);

    const e1 = makeEvent(card.id, 4);
    await store.enqueueAndProject(e1, card);
    const e2 = makeEvent(card.id, 3);
    await store.enqueueAndProject(e2, card);

    await store.markPermanentError(e1.review_id, 'fail');

    // Both rows still count
    expect(await store.pendingCount()).toBe(2);
  });
});

describe('destroy', () => {
  test('calls the destroyDb callback and closes the handle', async () => {
    const { store, destroyFn } = await createStore();
    await store.destroy();
    expect(destroyFn).toHaveBeenCalledTimes(1);
  });

  test('a new store on a fresh adapter starts from a clean state after destroy', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);
    const event = makeEvent(card.id, 4);
    await store.enqueueAndProject(event, card);
    expect(await store.pendingCount()).toBe(1);

    await store.destroy();

    // Simulate a fresh open for the same user: new in-memory DB = clean slate
    const { store: freshStore } = await createStore();
    expect(await freshStore.pendingCount()).toBe(0);
    await freshStore.close();
  });

  test('destroying one store does not affect a different store', async () => {
    // Each createStore() creates a separate in-memory DB instance (different DatabaseSync object),
    // so the two stores are fully isolated by construction – mimicking separate per-user DB files.
    const { store: storeA } = await createStore();
    const { store: storeB } = await createStore();

    const cardB = makeCard();
    await storeB.cacheCards([cardB]);
    await storeB.enqueueAndProject(makeEvent(cardB.id, 4), cardB);

    await storeA.destroy();

    // storeB must be unaffected
    expect(await storeB.pendingCount()).toBe(1);
    await storeB.close();
  });
});
