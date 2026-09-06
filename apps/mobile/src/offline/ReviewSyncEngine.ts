/**
 * ReviewSyncEngine – single-flight FIFO worker that drains the pending review queue.
 *
 * Pure TypeScript with injected store, reviewCardEvent, and sleep for testability.
 * A conflicted event is rebased onto the server card and retried in the same pass;
 * a card whose rebased retry conflicts again is left pending for the next sync.
 */

import type { ReviewEvent, ReviewSyncResult } from '@hanyu/data';
import { SYNC_BACKOFF_DELAYS_MS, defaultSleep, type SleepFn } from './backoff';
import type { QueuedReviewEvent, ReviewStore } from './ReviewStore';

export interface SyncSummary {
  applied: number;
  duplicates: number;
  conflicts: number;
  remaining: number;
}

export interface ReviewSyncEngineDeps {
  store: ReviewStore;
  reviewCardEvent: (event: ReviewEvent) => Promise<ReviewSyncResult>;
  sleep?: SleepFn;
}

type ErrorKind = 'auth' | 'transient' | 'permanent';

function classifyError(error: unknown): ErrorKind {
  if (!error || typeof error !== 'object') {
    return 'transient';
  }

  const { status, message } = error as { status?: number; code?: string; message?: string };

  if (status === 401 || status === 403) {
    return 'auth';
  }

  if (message && /signed in/i.test(message)) {
    return 'auth';
  }

  if (status === 404) {
    return 'permanent';
  }

  if (status === 400 || status === 422) {
    return 'permanent';
  }

  if (message && /not found/i.test(message)) {
    return 'permanent';
  }

  if (status !== undefined && status >= 500) {
    return 'transient';
  }

  if (message && /network|fetch failed|failed to fetch|timeout/i.test(message)) {
    return 'transient';
  }

  return 'transient';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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

export class ReviewSyncEngine {
  private readonly store: ReviewStore;
  private readonly reviewCardEvent: (event: ReviewEvent) => Promise<ReviewSyncResult>;
  private readonly sleep: SleepFn;
  private inFlight: Promise<SyncSummary> | null = null;

  constructor(deps: ReviewSyncEngineDeps) {
    this.store = deps.store;
    this.reviewCardEvent = deps.reviewCardEvent;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  sync(): Promise<SyncSummary> {
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<SyncSummary> {
    const summary: SyncSummary = {
      applied: 0,
      duplicates: 0,
      conflicts: 0,
      remaining: 0,
    };

    const allPending = await this.store.listPending();
    // A syncing row may be a claim left by a previous process that crashed
    // during the request. It is safe to retry it; permanent errors are the only
    // rows that must stay out of the worker.
    const queue = allPending.filter((ev) => ev.queue_state !== 'permanent_error');
    let remaining = queue.length;
    // A card is rebased at most once per pass. If the rebased retry conflicts
    // again the disagreement is real, so the card is left pending and the rest
    // of its events are skipped rather than applied out of order.
    const rebasedCards = new Set<string>();
    const conflictedCards = new Set<string>();

    let index = 0;
    while (index < queue.length) {
      const ev = queue[index];

      if (conflictedCards.has(ev.card_id)) {
        index += 1;
        continue;
      }

      const claimed = await this.store.markSyncing(ev.review_id);
      if (!claimed) {
        // Undo won the transaction race and removed the event locally.
        remaining -= 1;
        index += 1;
        continue;
      }

      const result = await this.submitWithRetry(ev);
      if (result === 'auth_stop') {
        await this.store.markPending(ev.review_id);
        break;
      }
      if (result === 'transient_exhausted') {
        await this.store.markPending(ev.review_id);
        index += 1;
        continue;
      }
      if (result === 'permanent_error') {
        remaining -= 1;
        index += 1;
        continue;
      }

      const { outcome } = result;
      if (outcome === 'conflict') {
        summary.conflicts += 1;
        await this.store.markPending(ev.review_id);

        if (rebasedCards.has(ev.card_id)) {
          conflictedCards.add(ev.card_id);
          index += 1;
          continue;
        }

        rebasedCards.add(ev.card_id);
        const forCard = queue.slice(index).filter((row) => row.card_id === ev.card_id);
        const rewritten = await this.store.rebase(result.card, forCard);
        const byReviewId = new Map(rewritten.map((row) => [row.review_id, row]));
        for (let ahead = index; ahead < queue.length; ahead += 1) {
          const replacement = byReviewId.get(queue[ahead].review_id);
          if (replacement) {
            queue[ahead] = replacement;
          }
        }
        // Retry this same event, now rebased onto the live server version.
        continue;
      }

      if (outcome === 'applied') {
        summary.applied += 1;
      } else if (outcome === 'duplicate') {
        summary.duplicates += 1;
      }

      await this.store.acknowledge(ev.review_id, result.card);
      remaining -= 1;
      index += 1;
    }

    summary.remaining = remaining;
    return summary;
  }

  private async submitWithRetry(
    ev: QueuedReviewEvent,
  ): Promise<
    | ReviewSyncResult
    | 'auth_stop'
    | 'transient_exhausted'
    | 'permanent_error'
  > {
    const event = toReviewEvent(ev);
    let lastError: unknown;

    for (let attempt = 0; attempt <= SYNC_BACKOFF_DELAYS_MS.length; attempt++) {
      try {
        return await this.reviewCardEvent(event);
      } catch (error) {
        lastError = error;
        const kind = classifyError(error);

        if (kind === 'auth') {
          return 'auth_stop';
        }

        if (kind === 'permanent') {
          await this.store.markPermanentError(ev.review_id, errorMessage(error));
          return 'permanent_error';
        }

        if (attempt < SYNC_BACKOFF_DELAYS_MS.length) {
          await this.sleep(SYNC_BACKOFF_DELAYS_MS[attempt]);
          continue;
        }
      }
    }

    return 'transient_exhausted';
  }
}
