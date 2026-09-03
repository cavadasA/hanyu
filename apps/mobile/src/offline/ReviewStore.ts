import type { ReviewEvent, VersionedCard } from '@hanyu/data';
import {
  applyReview,
  emptyState,
  schedulingParams,
  type Grade,
  type SchedulingState,
} from '@hanyu/domain';
import type { FSRSParameters } from 'ts-fsrs';

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
  queue_state: 'pending' | 'syncing' | 'permanent_error';
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
  /** Atomically claims a pending event for network submission. */
  markSyncing(reviewId: string): Promise<boolean>;
  /** Releases a claimed event after a submission that did not finish. */
  markPending(reviewId: string): Promise<void>;
  discardPending(reviewId: string): Promise<VersionedCard | null>;
  pendingCount(): Promise<number>;
  close(): Promise<void>;
  destroy(): Promise<void>;
}

interface PendingRow {
  review_id: string;
  card_id: string;
  grade: 1 | 2 | 3 | 4;
  time_ms: number | null;
  skill: ReviewEvent['skill'];
  state_json: string;
  prior_json: string;
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

const GRADE_NAME: Record<1 | 2 | 3 | 4, Grade> = {
  1: 'again',
  2: 'hard',
  3: 'good',
  4: 'easy',
};

function readSchedulingState(value: string | null | undefined): SchedulingState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SchedulingState>;
    if (
      typeof parsed.due === 'string' &&
      typeof parsed.state === 'string' &&
      typeof parsed.reps === 'number' &&
      typeof parsed.lapses === 'number'
    ) {
      return parsed as SchedulingState;
    }
  } catch {
    // A v1 queue row has no FSRS snapshot. It is reconstructed below.
  }
  return null;
}

function parseSchedulingState(
  stateJson: string,
  priorJson: string,
  grade: 1 | 2 | 3 | 4,
  reviewedAt: string,
  params: FSRSParameters,
  wantedState: boolean,
): SchedulingState {
  const storedState = readSchedulingState(wantedState ? stateJson : priorJson);
  if (storedState) return storedState;

  const prior = readSchedulingState(priorJson) ?? emptyState(new Date(reviewedAt));
  return wantedState
    ? applyReview(prior, GRADE_NAME[grade], new Date(reviewedAt), params).state
    : prior;
}

function replayPendingOnto(
  base: VersionedCard,
  events: PendingRow[],
  params: FSRSParameters,
): VersionedCard {
  let card = base;
  for (const ev of events) {
    const outcome = applyReview(card.scheduling, GRADE_NAME[ev.grade], new Date(ev.reviewed_at), params);
    card = {
      ...card,
      scheduling: outcome.state,
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
    private readonly params: FSRSParameters = schedulingParams({}),
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
        const projected = pending.length > 0 ? replayPendingOnto(card, pending, this.params) : card;
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
      .filter(c => c.scheduling.due <= now);
    due.sort((a, b) => a.scheduling.due.localeCompare(b.scheduling.due));
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
           (review_id, card_id, grade, time_ms, skill, state_json, prior_json,
            reviewed_at, expected_version, queue_sequence, state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
           coalesce((select max(queue_sequence) from pending_reviews), 0) + 1,
           'pending')`,
        [
          event.review_id,
          event.card_id,
          event.grade,
          event.time_ms,
          event.skill,
          JSON.stringify(event.state),
          JSON.stringify(event.prior),
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
      grade: r.grade,
      skill: r.skill,
      time_ms: r.time_ms,
      review_id: r.review_id,
      reviewed_at: r.reviewed_at,
      expected_version: r.expected_version,
      state: parseSchedulingState(r.state_json, r.prior_json, r.grade, r.reviewed_at, this.params, true),
      prior: parseSchedulingState(r.prior_json, r.prior_json, r.grade, r.reviewed_at, this.params, false),
      queue_sequence: r.queue_sequence,
      queue_state: r.state,
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
        remaining.length > 0 ? replayPendingOnto(serverCard, remaining, this.params) : serverCard;

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
           SET grade = ?, skill = ?, state_json = ?, prior_json = ?, time_ms = ?, reviewed_at = ?, expected_version = ?,
               state = ?, last_error = ?, attempt_count = ?
           WHERE review_id = ?`,
          [ev.grade, ev.skill, JSON.stringify(ev.state), JSON.stringify(ev.prior), ev.time_ms, ev.reviewed_at,
            ev.expected_version, ev.queue_state, ev.last_error, ev.attempt_count, ev.review_id],
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

  async markSyncing(reviewId: string): Promise<boolean> {
    let claimed = false;

    await this.db.withTransactionAsync(async () => {
      const row = await this.db.getFirstAsync<{ state: PendingRow['state'] }>(
        `SELECT state FROM pending_reviews
         WHERE review_id = ? AND state IN ('pending', 'syncing')`,
        [reviewId],
      );

      if (!row) return;

      if (row.state === 'pending') {
        await this.db.runAsync(
          `UPDATE pending_reviews SET state = 'syncing' WHERE review_id = ? AND state = 'pending'`,
          [reviewId],
        );
      }
      claimed = true;
    });

    return claimed;
  }

  async markPending(reviewId: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE pending_reviews SET state = 'pending' WHERE review_id = ? AND state = 'syncing'`,
      [reviewId],
    );
  }

  /**
   * Saca de la cola un evento que todavía no se ha sincronizado y devuelve la
   * tarjeta reproyectada sin él.
   *
   * Deshacer una valoración pendiente no necesita servidor: el estado del
   * servidor sigue guardado en server_json, y la proyección se obtiene
   * aplicando encima los eventos que queden. Es la misma operación que hace
   * rebase, con un evento menos.
   *
   * Devuelve null si el evento ya no está en la cola. No es un error: el motor
   * de sincronización puede haberlo enviado entre que el usuario pulsó Undo y
   * esta llamada llegó, y quien llama debe entonces revertirlo en servidor.
  */
  async discardPending(reviewId: string): Promise<VersionedCard | null> {
    let restored: VersionedCard | null = null;

    await this.db.withTransactionAsync(async () => {
      const row = await this.db.getFirstAsync<PendingRow>(
        `SELECT * FROM pending_reviews WHERE review_id = ? AND state = 'pending'`,
        [reviewId],
      );

      if (!row) {
        return;
      }

      await this.db.runAsync('DELETE FROM pending_reviews WHERE review_id = ?', [reviewId]);

      const cached = await this.db.getFirstAsync<CachedCardRow>(
        'SELECT * FROM cached_cards WHERE card_id = ?',
        [row.card_id],
      );

      if (!cached) {
        // La cola referenciaba una tarjeta que ya no está en caché. El evento
        // se descarta igualmente: dejarlo encolado enviaría al servidor una
        // valoración que el usuario acaba de deshacer.
        return;
      }

      const remaining = await this.db.getAllAsync<PendingRow>(
        `SELECT * FROM pending_reviews WHERE card_id = ? AND state != 'permanent_error' ORDER BY queue_sequence ASC`,
        [row.card_id],
      );

      const server = JSON.parse(cached.server_json) as VersionedCard;
      const projected = replayPendingOnto(server, remaining, this.params);

      await this.db.runAsync(UPDATE_CARD_PROJECTED, [
        JSON.stringify(projected),
        new Date().toISOString(),
        row.card_id,
      ]);

      restored = projected;
    });

    return restored;
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
