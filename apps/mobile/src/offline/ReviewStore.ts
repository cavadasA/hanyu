import type { ReviewEvent, VersionedCard } from '@hanyu/data';
import { applySm2 } from '@hanyu/domain';

/**
 * Minimal async DB handle interface – a structural subset of expo-sqlite's SQLiteDatabase.
 * expo-sqlite is never imported here; openReviewStore.ts bridges the real handle via
 * `db as unknown as DbHandle`.
 */
export interface DbHandle {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: unknown[]): Promise<void>;
  getAllAsync<T>(sql: string, params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: unknown[]): Promise<T | null>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

export type QueuedReviewEvent = ReviewEvent & {
  queue_sequence: number;
  state: 'pending' | 'syncing' | 'permanent_error';
  attempt_count: number;
  last_error: string | null;
};

export interface ReviewStore {
  cacheCards(cards: VersionedCard[]): Promise<void>;
  getDueProjectedCards(now: string, limit: number): Promise<VersionedCard[]>;
  enqueueAndProject(event: ReviewEvent, projected: VersionedCard): Promise<void>;
  listPending(): Promise<QueuedReviewEvent[]>;
  acknowledge(reviewId: string, serverCard: VersionedCard): Promise<void>;
  rebase(card: VersionedCard, events: QueuedReviewEvent[]): Promise<void>;
  markPermanentError(reviewId: string, message: string): Promise<void>;
  pendingCount(): Promise<number>;
  close(): Promise<void>;
  destroy(): Promise<void>;
}

interface PendingRow {
  review_id: string;
  card_id: string;
  quality: number;
  time_ms: number | null;
  reviewed_at: string;
  expected_version: number;
  queue_sequence: number;
  state: 'pending' | 'syncing' | 'permanent_error';
  attempt_count: number;
  last_error: string | null;
}

interface CachedCardRow {
  card_id: string;
  server_version: number;
  server_json: string;
  projected_json: string;
  updated_at: string;
}

function replayPendingOnto(base: VersionedCard, events: PendingRow[]): VersionedCard {
  let card = base;
  for (const ev of events) {
    const outcome = applySm2({
      state: {
        ease_factor: card.ease_factor,
        interval_days: card.interval_days,
        repetitions: card.repetitions,
        status: card.status,
        next_review_at: card.next_review_at,
      },
      quality: ev.quality,
      reviewed_at: ev.reviewed_at,
    });
    // Keep both mirrored field pairs in sync (interval/interval_days, next_review/next_review_at, etc.)
    card = {
      ...card,
      ease_factor: outcome.ease_factor,
      interval: outcome.interval_days,
      interval_days: outcome.interval_days,
      repetitions: outcome.repetitions,
      status: outcome.status,
      next_review: outcome.next_review_at,
      next_review_at: outcome.next_review_at,
      last_review: outcome.last_reviewed_at,
      last_reviewed_at: outcome.last_reviewed_at,
    };
  }
  return card;
}

// Full upsert – replaces server and projected fields.
const UPSERT_CARD_FULL = `
  INSERT INTO cached_cards (card_id, server_version, server_json, projected_json, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(card_id) DO UPDATE SET
    server_version = excluded.server_version,
    server_json    = excluded.server_json,
    projected_json = excluded.projected_json,
    updated_at     = excluded.updated_at
`;

// Projection-only update – never touches server_json/server_version.
// Used by enqueueAndProject, which requires the card to already exist in cached_cards.
const UPDATE_CARD_PROJECTED = `
  UPDATE cached_cards SET projected_json = ?, updated_at = ? WHERE card_id = ?
`;

export class ReviewStoreImpl implements ReviewStore {
  constructor(
    private readonly db: DbHandle,
    // Injected by openReviewStore.ts; called by destroy() to delete the on-disk file.
    private readonly destroyDb: () => Promise<void>,
  ) {}

  async cacheCards(cards: VersionedCard[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const now = new Date().toISOString();
      for (const card of cards) {
        // If pending events exist for this card, replay them on top of the incoming server
        // card so the user's in-flight local progress isn't silently discarded from the UI.
        const pending = await this.db.getAllAsync<PendingRow>(
          'SELECT * FROM pending_reviews WHERE card_id = ? AND state != \'permanent_error\' ORDER BY queue_sequence ASC',
          [card.id],
        );
        const projected = pending.length > 0 ? replayPendingOnto(card, pending) : card;
        await this.db.runAsync(UPSERT_CARD_FULL, [
          card.id,
          card.version,
          JSON.stringify(card),
          JSON.stringify(projected),
          now,
        ]);
      }
    });
  }

  async getDueProjectedCards(now: string, limit: number): Promise<VersionedCard[]> {
    // projected_json has no separate indexed date column; filter and sort in JS.
    const rows = await this.db.getAllAsync<Pick<CachedCardRow, 'projected_json'>>(
      'SELECT projected_json FROM cached_cards',
      [],
    );
    const due: VersionedCard[] = rows
      .map(r => JSON.parse(r.projected_json) as VersionedCard)
      .filter(c => c.next_review_at <= now);
    due.sort((a, b) => a.next_review_at.localeCompare(b.next_review_at));
    return due.slice(0, limit);
  }

  async enqueueAndProject(event: ReviewEvent, projected: VersionedCard): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const now = new Date().toISOString();
      // Guard: the card must already have a cached_cards row (created by cacheCards).
      // Allowing an uncached card here would fabricate server_json/server_version with
      // purely local data, which later conflict-resolution code reads as ground truth.
      const exists = await this.db.getFirstAsync<{ card_id: string }>(
        'SELECT card_id FROM cached_cards WHERE card_id = ?',
        [projected.id],
      );
      if (!exists) {
        throw new Error(
          `enqueueAndProject: card "${projected.id}" is not in cache – call cacheCards first`,
        );
      }
      // Update projection only – server_json/server_version are never touched here.
      await this.db.runAsync(UPDATE_CARD_PROJECTED, [
        JSON.stringify(projected),
        now,
        projected.id,
      ]);
      // queue_sequence is generated inside the transaction to avoid gaps.
      await this.db.runAsync(
        `INSERT INTO pending_reviews
           (review_id, card_id, quality, time_ms, reviewed_at, expected_version, queue_sequence, state)
         VALUES (?, ?, ?, ?, ?, ?,
           coalesce((select max(queue_sequence) from pending_reviews), 0) + 1,
           'pending')`,
        [
          event.review_id,
          event.card_id,
          event.quality,
          event.time_ms,
          event.reviewed_at,
          event.expected_version,
        ],
      );
    });
  }

  async listPending(): Promise<QueuedReviewEvent[]> {
    const rows = await this.db.getAllAsync<PendingRow>(
      'SELECT * FROM pending_reviews ORDER BY queue_sequence ASC',
      [],
    );
    return rows.map(r => ({
      card_id: r.card_id,
      quality: r.quality,
      time_ms: r.time_ms,
      review_id: r.review_id,
      reviewed_at: r.reviewed_at,
      expected_version: r.expected_version,
      queue_sequence: r.queue_sequence,
      state: r.state,
      attempt_count: r.attempt_count,
      last_error: r.last_error,
    }));
  }

  async acknowledge(reviewId: string, serverCard: VersionedCard): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM pending_reviews WHERE review_id = ?', [reviewId]);

      // Replay any remaining non-permanent events for this card on top of the server state.
      const remaining = await this.db.getAllAsync<PendingRow>(
        'SELECT * FROM pending_reviews WHERE card_id = ? AND state != \'permanent_error\' ORDER BY queue_sequence ASC',
        [serverCard.id],
      );
      const projected =
        remaining.length > 0 ? replayPendingOnto(serverCard, remaining) : serverCard;

      await this.db.runAsync(UPSERT_CARD_FULL, [
        serverCard.id,
        serverCard.version,
        JSON.stringify(serverCard),
        JSON.stringify(projected),
        new Date().toISOString(),
      ]);
    });
  }

  async rebase(card: VersionedCard, events: QueuedReviewEvent[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      // Treat the provided card as the new authoritative projection.
      await this.db.runAsync(UPSERT_CARD_FULL, [
        card.id,
        card.version,
        JSON.stringify(card),
        JSON.stringify(card),
        new Date().toISOString(),
      ]);
      // Persist all mutable event fields (primarily expected_version rewrite after conflict).
      for (const ev of events) {
        await this.db.runAsync(
          `UPDATE pending_reviews
           SET quality = ?, time_ms = ?, reviewed_at = ?, expected_version = ?,
               state = ?, last_error = ?, attempt_count = ?
           WHERE review_id = ?`,
          [ev.quality, ev.time_ms, ev.reviewed_at, ev.expected_version, ev.state, ev.last_error, ev.attempt_count, ev.review_id],
        );
      }
    });
  }

  async markPermanentError(reviewId: string, message: string): Promise<void> {
    // attempt_count is incremented here because no other public method does so;
    // if a later task adds a dedicated retry/increment method, this should be revisited.
    await this.db.runAsync(
      `UPDATE pending_reviews
       SET state = 'permanent_error', last_error = ?, attempt_count = attempt_count + 1
       WHERE review_id = ?`,
      [message, reviewId],
    );
  }

  async pendingCount(): Promise<number> {
    // Counts ALL rows regardless of state (including permanent_error).
    // If a later task builds a "pending sync" badge, it may want to exclude permanent_error rows.
    const row = await this.db.getFirstAsync<{ cnt: number }>(
      'SELECT count(*) as cnt FROM pending_reviews',
      [],
    );
    return row?.cnt ?? 0;
  }

  async close(): Promise<void> {
    await this.db.closeAsync();
  }

  async destroy(): Promise<void> {
    await this.db.closeAsync();
    await this.destroyDb();
  }
}
