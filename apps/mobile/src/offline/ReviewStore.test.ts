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
import { deriveDbName } from './dbName';
import { applyReview, emptyState, schedulingParams, type Grade } from '@hanyu/domain';

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
    withTransactionAsync: async (fn: () => Promise<void>): Promise<void> => {
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
    skill: 'recognition',
    is_new: false,
    scheduling: emptyState(new Date('2026-07-31T10:00:00.000Z')),
    version: 1,
    ...overrides,
  };
}

function makeEvent(
  cardId: string,
  grade: Grade | number,
  overrides: Partial<ReviewEvent> = {},
): ReviewEvent {
  reviewSeq += 1;
  return {
    review_id: `rev-${reviewSeq}`,
    card_id: cardId,
    grade:
      typeof grade === 'number'
        ? (grade as 1 | 2 | 3 | 4)
        : ({ again: 1, hard: 2, good: 3, easy: 4 }[grade] as 1 | 2 | 3 | 4),
    skill: 'recognition',
    time_ms: 1000,
    reviewed_at: '2026-07-31T10:00:00.000Z',
    expected_version: 1,
    state: emptyState(new Date('2026-07-31T10:00:00.000Z')),
    prior: emptyState(new Date('2026-07-31T10:00:00.000Z')),
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

describe('deriveDbName', () => {
  test('accepts a valid UUID-like userId and produces the expected filename', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(deriveDbName(id)).toBe(`hanyu-review-${id}.db`);
  });

  test('accepts alphanumeric, hyphen, and underscore chars up to 64 chars', () => {
    expect(deriveDbName('user_123')).toBe('hanyu-review-user_123.db');
    expect(deriveDbName('abc-XYZ-789')).toBe('hanyu-review-abc-XYZ-789.db');
    expect(deriveDbName('a'.repeat(64))).toBe(`hanyu-review-${'a'.repeat(64)}.db`);
  });

  test.each([
    ['empty string', ''],
    ['dot-segment', '..'],
    ['forward slash', 'user/path'],
    ['backslash', 'user\\path'],
    ['colon', 'user:name'],
    ['embedded null byte', 'user\0name'],
    ['oversized (65 chars)', 'a'.repeat(65)],
  ])('rejects %s', (_label, id) => {
    expect(() => deriveDbName(id)).toThrow();
  });
});

describe('schema migration', () => {
  test('fresh open sets PRAGMA user_version to 2 and creates all three tables', async () => {
    const nativeDb = new DatabaseSync(':memory:');
    const handle = makeTestHandle(nativeDb);

    // Before migration
    const before = await handle.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(before?.user_version).toBe(0);

    await applySchema(handle);

    // After migration
    const after = await handle.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(after?.user_version).toBe(2);

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
    expect(row?.user_version).toBe(2);
  });

  test('migrates a v1 queue from quality to FSRS grade', async () => {
    const nativeDb = new DatabaseSync(':memory:');
    const handle = makeTestHandle(nativeDb);
    await handle.execAsync(`
      create table pending_reviews (
        review_id text primary key,
        card_id text not null,
        quality integer not null,
        time_ms integer,
        reviewed_at text not null,
        expected_version integer not null,
        queue_sequence integer not null unique,
        state text not null,
        attempt_count integer not null default 0,
        last_error text
      );
      insert into pending_reviews values
        ('r-v1', 'card-1', 5, 1000, '2026-07-31T10:00:00.000Z', 1, 1, 'pending', 0, null);
      pragma user_version = 1;
    `);

    await applySchema(handle);

    const columns = await handle.getAllAsync<{ name: string }>('pragma table_info(pending_reviews)', []);
    expect(columns.map(column => column.name)).toContain('grade');
    expect(columns.map(column => column.name)).not.toContain('quality');
    const row = await handle.getFirstAsync<{ grade: number; skill: string }>(
      'select grade, skill from pending_reviews where review_id = ?',
      ['r-v1'],
    );
    expect(row).toEqual({ grade: 4, skill: 'recognition' });
  });
});

describe('cacheCards', () => {
  test('upserts cards into cached_cards', async () => {
    const { store } = await createStore();
    const card = makeCard({ scheduling: { ...makeCard().scheduling, due: '2026-08-01T00:00:00.000Z' } });
    await store.cacheCards([card]);

    const due = await store.getDueProjectedCards('2026-08-02T00:00:00.000Z', 10);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe(card.id);
  });

  test('updates an existing card on second cacheCards call', async () => {
    const { store } = await createStore();
    const card = makeCard({ scheduling: { ...makeCard().scheduling, due: '2026-08-01T00:00:00.000Z' } });
    await store.cacheCards([card]);

    const updated = { ...card, version: 2, scheduling: { ...card.scheduling, scheduled_days: 7 } };
    await store.cacheCards([updated]);

    const due = await store.getDueProjectedCards('2026-08-02T00:00:00.000Z', 10);
    expect(due).toHaveLength(1);
    expect(due[0].scheduling.scheduled_days).toBe(7);
  });

  test('replays pending reviews with the latest FSRS parameters', async () => {
    const { store, handle } = await createStore();
    const card = makeCard();
    const highRetention = schedulingParams({ request_retention: 0.95 });
    const event = makeEvent(card.id, 'easy');

    await store.cacheCards([card]);
    await store.enqueueAndProject(event, card);
    store.setParams(highRetention);
    await store.cacheCards([{ ...card, version: 2 }]);

    const row = await handle.getFirstAsync<{ projected_json: string }>(
      'SELECT projected_json FROM cached_cards WHERE card_id = ?',
      [card.id],
    );
    const projected = JSON.parse(row!.projected_json) as VersionedCard;
    const expected = applyReview(
      card.scheduling,
      'easy',
      new Date(event.reviewed_at),
      highRetention,
    ).state;

    expect(projected.scheduling).toMatchObject(expected);
  });

  test('preserves pending-event projection when caching a new server card', async () => {
    const { store, handle } = await createStore();
    const card = makeCard({
      scheduling: { ...makeCard().scheduling, due: '2026-07-30T00:00:00.000Z' },
    });

    // Cache the initial server card
    await store.cacheCards([card]);

    // Enqueue an Easy review so there is a pending event
    const event = makeEvent(card.id, 'easy');
    const projectedAfterReview = makeCard({
      id: card.id,
      scheduling: { ...card.scheduling, due: '2099-12-31T00:00:00.000Z' },
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
    // The projection must be > serverRefresh.scheduling.due (pending event pushed it forward)
    expect(projectedCard!.scheduling.due > serverRefresh.scheduling.due).toBe(true);

    // server_version and server_json must reflect the NEW server card (version 2),
    // not the original version 1 or the local projection.
    const row = await handle.getFirstAsync<{ server_version: number; server_json: string }>(
      'SELECT server_version, server_json FROM cached_cards WHERE card_id = ?',
      [card.id],
    );
    expect(row?.server_version).toBe(serverRefresh.version); // 2
    const serverData = JSON.parse(row!.server_json) as VersionedCard;
    expect(serverData.version).toBe(serverRefresh.version); // 2
    // server_json must NOT contain the locally-projected due time
    expect(serverData.scheduling.due).toBe(serverRefresh.scheduling.due);
  });
});

describe('enqueueAndProject', () => {
  test('inserts into both pending_reviews and updates cached_cards', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);

    const event = makeEvent(card.id, 'hard');
    const projected = { ...card, scheduling: { ...card.scheduling, due: '2099-01-01T00:00:00.000Z' } };
    await store.enqueueAndProject(event, projected);

    expect(await store.pendingCount()).toBe(1);
    const due = await store.getDueProjectedCards('2099-01-02T00:00:00.000Z', 10);
    expect(due[0].scheduling.due).toBe('2099-01-01T00:00:00.000Z');
  });

  test('throws when the card has not been cached yet (never fabricates server state)', async () => {
    const { store } = await createStore();
    const card = makeCard();
    // Deliberately no cacheCards call
    const event = makeEvent(card.id, 'hard');
    const projected = { ...card, scheduling: { ...card.scheduling, scheduled_days: 6 } };

    await expect(store.enqueueAndProject(event, projected)).rejects.toThrow(
      /not in cache|cacheCards/i,
    );

    // Nothing was written to pending_reviews either (transaction rolled back)
    expect(await store.pendingCount()).toBe(0);
  });

  test('rolls back both tables atomically on constraint violation', async () => {
    const { store } = await createStore();
    const card = makeCard({ scheduling: { ...makeCard().scheduling, due: '2026-07-30T00:00:00.000Z' } });
    await store.cacheCards([card]);

    // grade = 10 violates the CHECK constraint (grade between 1 and 4)
    const badEvent = makeEvent(card.id, 10);
    const projected = { ...card, scheduling: { ...card.scheduling, scheduled_days: 99 } };

    await expect(store.enqueueAndProject(badEvent, projected)).rejects.toThrow();

    // pending_reviews must be empty (no partial insert)
    expect(await store.pendingCount()).toBe(0);

    // cached_cards projection must not have been updated to scheduled_days=99
    const due = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    expect(due[0].scheduling.scheduled_days).toBe(0);
  });
});

describe('listPending', () => {
  test('returns events ordered by queue_sequence ascending', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);

    const e1 = makeEvent(card.id, 'good');
    const p1 = { ...card, scheduling: { ...card.scheduling, scheduled_days: 1 } };
    await store.enqueueAndProject(e1, p1);

    const e2 = makeEvent(card.id, 'easy');
    const p2 = { ...card, scheduling: { ...card.scheduling, scheduled_days: 6 } };
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
    const event = makeEvent(card.id, 'hard');
    await store.enqueueAndProject(event, card);

    const [item] = await store.listPending();
    expect(item.queue_state).toBe('pending');
    expect(item.attempt_count).toBe(0);
    expect(item.last_error).toBeNull();
  });
});

describe('acknowledge', () => {
  test('reprojects consecutive failed reviews with FSRS without losing the lapse', async () => {
    const { store } = await createStore();
    const card = makeCard({
      scheduling: {
        ...makeCard().scheduling,
        difficulty: 5,
        stability: 30,
        reps: 8,
        scheduled_days: 30,
        elapsed_days: 30,
        state: 'review',
        due: '2026-01-01T00:00:00.000Z',
        last_review: '2025-12-01T00:00:00.000Z',
      },
    });
    await store.cacheCards([card]);

    await store.enqueueAndProject(
      makeEvent(card.id, 'again', { review_id: 'again-1', reviewed_at: '2026-07-31T10:00:00.000Z' }),
      card,
    );
    await store.enqueueAndProject(
      makeEvent(card.id, 'again', { review_id: 'again-2', reviewed_at: '2026-07-31T10:01:00.000Z' }),
      card,
    );

    await store.cacheCards([{ ...card, version: 2 }]);

    const projected = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    // FSRS counts the transition from Review to Relearning as a lapse; a
    // second Again while already relearning keeps that count at one.
    expect(projected[0].scheduling.lapses).toBe(1);
  });

  test('removes acknowledged event and updates cached card to server state', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);

    const event = makeEvent(card.id, 'easy');
    const projected = { ...card, scheduling: { ...card.scheduling, scheduled_days: 6 } };
    await store.enqueueAndProject(event, projected);

    const serverCard = { ...card, version: 2, scheduling: { ...card.scheduling, scheduled_days: 6 } };
    await store.acknowledge(event.review_id, serverCard);

    expect(await store.pendingCount()).toBe(0);
    const due = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    expect(due[0].scheduling.scheduled_days).toBe(6);
    expect(due[0].version).toBe(2);
  });

  test('replays remaining pending events on top of server card (no regression)', async () => {
    const { store } = await createStore();
    const card = makeCard({
      scheduling: { ...makeCard().scheduling, due: '2026-01-01T00:00:00.000Z' },
    });
    await store.cacheCards([card]);

    // Two back-to-back reviews
    const e1 = makeEvent(card.id, 'easy', { reviewed_at: '2026-07-31T10:00:00.000Z' });
    const p1 = { ...card, scheduling: { ...card.scheduling, due: '2026-08-08T10:00:00.000Z' } }; // interim projection
    await store.enqueueAndProject(e1, p1);

    const e2 = makeEvent(card.id, 'hard', { reviewed_at: '2026-07-31T11:00:00.000Z', expected_version: 2 });
    const p2 = { ...card, scheduling: { ...card.scheduling, due: '2026-08-01T11:00:00.000Z' } }; // interim projection
    await store.enqueueAndProject(e2, p2);

    expect(await store.pendingCount()).toBe(2);

    // Server acknowledges e1 with version 2
    const serverCardV2 = {
      ...card,
      version: 2,
      scheduling: {
        ...card.scheduling,
        reps: 1,
        state: 'learning' as const,
        due: '2026-07-31T10:00:00.000Z',
      },
    };
    await store.acknowledge(e1.review_id, serverCardV2);

    // e2 must still be pending; projection = applyReview(serverCardV2, e2)
    expect(await store.pendingCount()).toBe(1);
    const remaining = await store.listPending();
    expect(remaining[0].review_id).toBe(e2.review_id);

    // The projection stored in cached_cards must reflect e2 replayed on serverCardV2,
    // NOT just the raw serverCardV2 state
    const due = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    const proj = due.find(c => c.id === card.id);
    expect(proj).toBeDefined();
    expect(proj!.scheduling.due > serverCardV2.scheduling.due).toBe(true);
    expect(proj!.scheduling.lapses).toBe(0);
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
    expect(item.queue_state).toBe('permanent_error');
    expect(item.last_error).toBe('version conflict');
    expect(item.attempt_count).toBe(1);
  });

  test('permanent_error events are excluded from projection replay in cacheCards', async () => {
    const { store } = await createStore();
    const card = makeCard({
      scheduling: { ...makeCard().scheduling, due: '2026-01-01T00:00:00.000Z' },
    });
    await store.cacheCards([card]);

    // Enqueue and mark as permanent_error so it should never affect projection again.
    const event = makeEvent(card.id, 'easy');
    await store.enqueueAndProject(event, {
      ...card,
      scheduling: { ...card.scheduling, scheduled_days: 99, due: '2099-01-01T00:00:00.000Z' },
    });
    await store.markPermanentError(event.review_id, 'server rejection');

    // Re-cache the card; the permanent_error event must NOT be replayed.
    const serverRefresh = { ...card, version: 2 };
    await store.cacheCards([serverRefresh]);

    const due = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    const projectedCard = due.find(c => c.id === card.id);
    expect(projectedCard).toBeDefined();
    // Projection equals serverRefresh (no FSRS applied from the errored event)
    expect(projectedCard!.scheduling).toEqual(serverRefresh.scheduling);
  });
});

describe('discardPending', () => {
  test('does not discard an event already claimed by the sync engine', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);
    const event = makeEvent(card.id, 'easy');
    await store.enqueueAndProject(event, card);

    expect(await store.markSyncing(event.review_id)).toBe(true);
    expect(await store.discardPending(event.review_id)).toBeNull();
    expect((await store.listPending())[0].queue_state).toBe('syncing');
  });

  test('returns the reprojected card even when the database transaction does not return the callback value', async () => {
    const { store, handle } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);

    const event = makeEvent(card.id, 'easy', { review_id: 'r-transaction', expected_version: card.version });
    await store.enqueueAndProject(event, {
      ...card,
      scheduling: { ...card.scheduling, reps: card.scheduling.reps + 1 },
    });

    handle.withTransactionAsync = (async (fn: () => Promise<unknown>) => {
      await fn();
    }) as unknown as DbHandle['withTransactionAsync'];

    const restored = await store.discardPending(event.review_id);

    expect(restored).not.toBeNull();
    expect(restored!.scheduling.reps).toBe(card.scheduling.reps);
  });

  test('removes the event and re-projects the card without it', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);

    const event = makeEvent(card.id, 'easy', { review_id: 'r1', expected_version: card.version });
    await store.enqueueAndProject(event, {
      ...card,
      scheduling: { ...card.scheduling, reps: card.scheduling.reps + 1, scheduled_days: 6 },
    });

    const restored = await store.discardPending('r1');

    expect(restored).not.toBeNull();
    expect(restored!.scheduling.reps).toBe(card.scheduling.reps);
    expect(restored!.scheduling.scheduled_days).toBe(card.scheduling.scheduled_days);
    expect(await store.pendingCount()).toBe(0);
  });

  test('keeps the events queued after the discarded one', async () => {
    const { store } = await createStore();
    const first = makeCard();
    const second = makeCard();
    await store.cacheCards([first, second]);

    await store.enqueueAndProject(
      makeEvent(first.id, 'easy', { review_id: 'r1', expected_version: first.version }),
      { ...first, scheduling: { ...first.scheduling, reps: first.scheduling.reps + 1 } },
    );
    await store.enqueueAndProject(
      makeEvent(second.id, 'good', { review_id: 'r2', expected_version: second.version }),
      { ...second, scheduling: { ...second.scheduling, reps: second.scheduling.reps + 1 } },
    );

    await store.discardPending('r1');

    const pending = await store.listPending();
    expect(pending.map((entry) => entry.review_id)).toEqual(['r2']);
  });

  test('returns null when the event is no longer queued', async () => {
    const { store } = await createStore();
    await store.cacheCards([makeCard()]);

    expect(await store.discardPending('never-queued')).toBeNull();
  });

  test('does not discard a permanent_error event', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);
    const event = makeEvent(card.id, 'easy');
    await store.enqueueAndProject(event, card);
    await store.markPermanentError(event.review_id, 'server rejected it');

    expect(await store.discardPending(event.review_id)).toBeNull();
    expect(await store.pendingCount()).toBe(1);
  });

  test('removes a queued event even when its cached card is missing', async () => {
    const { store, handle } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);
    const event = makeEvent(card.id, 'easy');
    await store.enqueueAndProject(event, card);
    await handle.runAsync('DELETE FROM cached_cards WHERE card_id = ?', [card.id]);

    expect(await store.discardPending(event.review_id)).toBeNull();
    expect(await store.pendingCount()).toBe(0);
  });
});

describe('rebase', () => {
  test('updates cached card and rewrites expected_version on pending events', async () => {
    const { store } = await createStore();
    const card = makeCard({
      version: 1,
      scheduling: { ...makeCard().scheduling, scheduled_days: 1 },
    });
    await store.cacheCards([card]);

    const event = makeEvent(card.id, 'easy', { expected_version: 1 });
    await store.enqueueAndProject(event, {
      ...card,
      scheduling: { ...card.scheduling, scheduled_days: 6 },
    });

    const rebasedCard = {
      ...card,
      version: 3,
      scheduling: { ...card.scheduling, scheduled_days: 10 },
    };
    const pending = await store.listPending();
    const rebasedEvents = pending.map(e => ({ ...e, expected_version: 3 }));

    await store.rebase(rebasedCard, rebasedEvents);

    // cached_cards must reflect the rebased card
    const due = await store.getDueProjectedCards('2099-01-01T00:00:00.000Z', 10);
    expect(due[0].version).toBe(3);
    expect(due[0].scheduling.scheduled_days).toBe(10);

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

describe('destroy and close', () => {
  test('close() genuinely closes the underlying database handle', async () => {
    // Use a dedicated nativeDb so we can test handle closure directly.
    const nativeDb = new DatabaseSync(':memory:');
    const handle = makeTestHandle(nativeDb);
    await applySchema(handle);
    const store = new ReviewStoreImpl(handle, jest.fn().mockResolvedValue(undefined));

    await store.close();

    // The underlying handle is genuinely closed – any subsequent DB operation must throw.
    await expect(store.pendingCount()).rejects.toThrow();
  });

  test('destroy() closes the handle then invokes the destroyDb callback', async () => {
    const nativeDb = new DatabaseSync(':memory:');
    const handle = makeTestHandle(nativeDb);
    await applySchema(handle);
    const destroyFn = jest.fn().mockResolvedValue(undefined);
    const store = new ReviewStoreImpl(handle, destroyFn);

    await store.destroy();

    expect(destroyFn).toHaveBeenCalledTimes(1);
    // Handle is genuinely closed – subsequent queries must throw.
    await expect(store.pendingCount()).rejects.toThrow();
  });

  test('destroying one store does not affect a different store', async () => {
    const { store: storeA } = await createStore();
    const { store: storeB } = await createStore();

    const cardB = makeCard();
    await storeB.cacheCards([cardB]);
    await storeB.enqueueAndProject(makeEvent(cardB.id, 4), cardB);

    await storeA.destroy();

    // storeA is genuinely closed – its operations now throw.
    await expect(storeA.pendingCount()).rejects.toThrow();

    // storeB is completely unaffected.
    expect(await storeB.pendingCount()).toBe(1);
    await storeB.close();
  });
});
