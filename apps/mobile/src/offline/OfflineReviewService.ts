/**
 * OfflineReviewService – pure TypeScript, zero React/Expo-native imports.
 *
 * Wraps a ReviewStore with a cache-first load strategy and local SM-2 rating.
 * All I/O dependencies (store, clock, uuid, online fetch) are constructor-injected
 * so that the class can be tested in plain Node/Jest without any native modules.
 */

import type { VersionedCard, ReviewEvent } from '@hanyu/data';
import { applySm2 } from '@hanyu/domain';
import type { ReviewStore } from './ReviewStore';

export interface OfflineReviewServiceDeps {
  store: ReviewStore;
  /**
   * Narrow shape needed from HanyuData['flashcards']['getDueCards'].
   * Kept this way intentionally: we only need cards, and we need the return
   * typed as unknown[] so we can do our own runtime version validation.
   */
  getDueCardsOnline: (limit: number) => Promise<{ cards: unknown[] }>;
  /** Injected clock – production default: `() => new Date()`. */
  now: () => Date;
  /** Injected id generator – production default: expo-crypto randomUUID. */
  uuid: () => string;
}

export class OfflineReviewService {
  private readonly store: ReviewStore;
  private readonly getDueCardsOnlineImpl: (limit: number) => Promise<{ cards: unknown[] }>;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  /** Per-card-id synchronous double-tap guard. */
  private readonly inFlight = new Set<string>();

  constructor(deps: OfflineReviewServiceDeps) {
    this.store = deps.store;
    this.getDueCardsOnlineImpl = deps.getDueCardsOnline;
    this.now = deps.now;
    this.uuid = deps.uuid;
  }

  /**
   * Cache-first load with optional online refresh.
   *
   * Algorithm:
   * 1. Read projected due cards from the local store (the "cached" baseline).
   * 2. Attempt an online fetch.
   *    a. On success: validate that every returned card carries a non-null version
   *       (mirrors `mapVersionedCardRow`'s defensive throw). Write valid cards into
   *       the store (preserving any in-flight pending projections), then return the
   *       freshly-merged read.
   *    b. On any error (network, auth, validation): swallow the error and return
   *       the cached cards from step 1. loadDueCards never throws due to network
   *       failure — offline-first means the local store is always the fallback.
   */
  async loadDueCards(limit = 50): Promise<VersionedCard[]> {
    const nowIso = this.now().toISOString();
    const cached = await this.store.getDueProjectedCards(nowIso, limit);

    try {
      const online = await this.getDueCardsOnlineImpl(limit);
      const freshCards: VersionedCard[] = [];

      for (const raw of online.cards) {
        if (raw === null || raw === undefined || typeof raw !== 'object') {
          throw new Error('Online card response contained a non-object entry');
        }
        const c = raw as Record<string, unknown>;
        if (c.version === undefined || c.version === null) {
          // Mirrors mapVersionedCardRow's defensive throw — a card without a
          // version cannot be tracked for conflict detection.
          throw new Error(
            `Card "${String(c.id)}" returned by getDueCards is missing the version field`,
          );
        }
        freshCards.push(c as unknown as VersionedCard);
      }

      await this.store.cacheCards(freshCards);
      return await this.store.getDueProjectedCards(this.now().toISOString(), limit);
    } catch {
      // Any error (network, auth, validation) falls back to the cached baseline.
      return cached;
    }
  }

  /**
   * Locally rate a card using SM-2 and enqueue the event for later sync.
   *
   * The in-flight guard at the very top is intentionally synchronous (before any
   * await) so that firing two concurrent calls back-to-back without awaiting the
   * first reliably rejects the second before it can proceed.
   *
   * The method never resolves before `enqueueAndProject` resolves. If the store
   * write fails, the error propagates untouched — no partial state is returned.
   */
  async rateCard(
    card: VersionedCard,
    quality: number,
    timeMs: number | null,
  ): Promise<VersionedCard> {
    // Synchronous double-tap guard — checked before any await.
    if (this.inFlight.has(card.id)) {
      throw new Error('A rating for this card is already in progress');
    }
    this.inFlight.add(card.id);

    try {
      const reviewedAt = this.now().toISOString();
      const outcome = applySm2({ state: card, quality, reviewed_at: reviewedAt });

      const event: ReviewEvent = {
        card_id: card.id,
        quality,
        time_ms: timeMs,
        review_id: this.uuid(),
        reviewed_at: reviewedAt,
        expected_version: card.version,
      };

      // Keep all aliased field pairs (interval/interval_days etc.) in sync,
      // following the same pattern as ReviewStore.ts's replayPendingOnto().
      const projected: VersionedCard = {
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

      // Do not return / mutate screen state until the store write succeeds.
      // If enqueueAndProject throws, we let the error propagate unchanged.
      await this.store.enqueueAndProject(event, projected);
      return projected;
    } finally {
      // Always release the guard — whether the write succeeded or threw.
      this.inFlight.delete(card.id);
    }
  }

  async pendingCount(): Promise<number> {
    return this.store.pendingCount();
  }

  async close(): Promise<void> {
    return this.store.close();
  }

  async destroy(): Promise<void> {
    return this.store.destroy();
  }
}
