/**
 * ReviewSyncEngine – single-flight FIFO worker that drains the pending review queue.
 *
 * Pure TypeScript with injected store, reviewCardEvent, and sleep for testability.
 * Conflict rebase wiring is Task 7; conflicts are counted and left pending here.
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
    quality: ev.quality,
    time_ms: ev.time_ms,
    review_id: ev.review_id,
    reviewed_at: ev.reviewed_at,
    expected_version: ev.expected_version,
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
    const pending = allPending.filter((ev) => ev.state === 'pending');
    let remaining = pending.length;
    // Skip remaining events for a card after a conflict this run — expected_versions
    // are stale until Task 7 rebase rewrites them.
    const conflictedCards = new Set<string>();

    for (const ev of pending) {
      if (conflictedCards.has(ev.card_id)) {
        continue;
      }

      const result = await this.submitWithRetry(ev);
      if (result === 'auth_stop') {
        break;
      }
      if (result === 'transient_exhausted') {
        continue;
      }
      if (result === 'permanent_error') {
        remaining -= 1;
        continue;
      }

      const { outcome } = result;
      if (outcome === 'applied') {
        summary.applied += 1;
      } else if (outcome === 'duplicate') {
        summary.duplicates += 1;
      } else if (outcome === 'conflict') {
        summary.conflicts += 1;
        conflictedCards.add(ev.card_id);
        continue;
      }

      await this.store.acknowledge(ev.review_id, result.card);
      remaining -= 1;
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
