/**
 * OfflineReviewService – pure TypeScript, zero React/Expo-native imports.
 *
 * Wraps a ReviewStore with a cache-first load strategy and local FSRS rating.
 * All I/O dependencies (store, clock, uuid, online fetch) are constructor-injected
 * so that the class can be tested in plain Node/Jest without any native modules.
 */

import type { LearningSkill, RevertOutcome, VersionedCard, ReviewEvent } from '@hanyu/data';
import { applyReview, type Grade } from '@hanyu/domain';
import type { FSRSParameters } from 'ts-fsrs';
import type { ReviewStore } from './ReviewStore';

const GRADE_NUMBER: Record<Grade, 1 | 2 | 3 | 4> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

export interface OfflineReviewServiceDeps {
  store: ReviewStore;
  /**
   * Narrow shape needed from HanyuData['flashcards']['getDueCards'].
   * Kept this way intentionally: we only need cards, and we need the return
   * typed as unknown[] so we can do our own runtime version validation.
   */
  getDueCardsOnline: (
    limit: number,
    deckId: string | null,
    skill?: LearningSkill,
  ) => Promise<{ cards: unknown[]; deck_size?: number }>;
  /** Injected clock – production default: `() => new Date()`. */
  now: () => Date;
  /** Injected id generator – production default: expo-crypto randomUUID. */
  uuid: () => string;
  /** Scheduling parameters, re-read when the user changes settings. */
  params: () => FSRSParameters;
  /** Refreshes settings before a review when the provider can read them. */
  refreshParams?: () => Promise<FSRSParameters>;
  /**
   * Revierte en servidor una valoración ya sincronizada. Inyectada como el
   * resto de la E/S para que el servicio siga siendo probable en Node puro.
   */
  revertReviewOnline: (reviewId: string) => Promise<{ outcome: RevertOutcome; card: VersionedCard | null }>;
}

export class OfflineReviewService {
  private readonly store: ReviewStore;
  private readonly getDueCardsOnlineImpl: (
    limit: number,
    deckId: string | null,
    skill?: LearningSkill,
  ) => Promise<{ cards: unknown[]; deck_size?: number }>;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  private readonly params: () => FSRSParameters;
  private readonly refreshParams?: () => Promise<FSRSParameters>;
  private readonly revertReviewOnline: (
    reviewId: string,
  ) => Promise<{ outcome: RevertOutcome; card: VersionedCard | null }>;
  /** Per-card-id synchronous double-tap guard. */
  private readonly inFlight = new Set<string>();
  private _lastDeckSize: number | null = null;

  get lastDeckSize(): number | null {
    return this._lastDeckSize;
  }

  constructor(deps: OfflineReviewServiceDeps) {
    this.store = deps.store;
    this.getDueCardsOnlineImpl = deps.getDueCardsOnline;
    this.now = deps.now;
    this.uuid = deps.uuid;
    this.params = deps.params;
    this.refreshParams = deps.refreshParams;
    this.revertReviewOnline = deps.revertReviewOnline;
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
  async loadDueCards(
    limit = 50,
    deckId: string | null = null,
    skill: LearningSkill = 'recognition',
  ): Promise<VersionedCard[]> {
    const nowIso = this.now().toISOString();
    const cached = await this.store.getDueProjectedCards(nowIso, limit);

    try {
      const online = skill === 'recognition'
        ? await this.getDueCardsOnlineImpl(limit, deckId)
        : await this.getDueCardsOnlineImpl(limit, deckId, skill);
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

      this._lastDeckSize =
        typeof online.deck_size === 'number' && Number.isFinite(online.deck_size)
          ? online.deck_size
          : null;

      await this.store.cacheCards(freshCards);
      const refreshed = await this.store.getDueProjectedCards(this.now().toISOString(), limit);
      if (deckId !== null) {
        const focusedIds = new Set(freshCards.map((card) => card.id));
        return refreshed.filter((card) => focusedIds.has(card.id));
      }
      return refreshed;
    } catch {
      // Any error (network, auth, validation) falls back to the cached baseline.
      this._lastDeckSize = null;
      return cached;
    }
  }

  /**
   * Locally rate a card using FSRS and enqueue the event for later sync.
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
    grade: Grade,
    timeMs: number | null,
  ): Promise<{ card: VersionedCard; reviewId: string }> {
    // Synchronous double-tap guard — checked before any await.
    if (this.inFlight.has(card.id)) {
      throw new Error('A rating for this card is already in progress');
    }
    this.inFlight.add(card.id);

    try {
      const reviewedAt = this.now();
      const params = this.refreshParams ? await this.refreshParams() : this.params();
      this.store.setParams(params);
      const outcome = applyReview(card.scheduling, grade, reviewedAt, params);

      const event: ReviewEvent = {
        card_id: card.id,
        grade: GRADE_NUMBER[grade],
        skill: card.skill,
        time_ms: timeMs,
        review_id: this.uuid(),
        reviewed_at: reviewedAt.toISOString(),
        expected_version: card.version,
        state: outcome.state,
        prior: card.scheduling,
      };

      const projected: VersionedCard = {
        ...card,
        scheduling: outcome.state,
      };

      // Do not return / mutate screen state until the store write succeeds.
      // If enqueueAndProject throws, we let the error propagate unchanged.
      await this.store.enqueueAndProject(event, projected);
      return { card: projected, reviewId: event.review_id };
    } finally {
      // Always release the guard — whether the write succeeded or threw.
      this.inFlight.delete(card.id);
    }
  }

  /**
   * Deshace una valoración.
   *
   * Si el evento sigue en la cola local, se descarta y la tarjeta se reproyecta
   * sin él: no hace falta red y el servidor nunca llegó a verlo. Si ya se
   * sincronizó, hay que revertirlo en el servidor, porque srs_cards, review_log
   * y user_stats ya lo incorporaron.
   */
  async undoRating(reviewId: string): Promise<VersionedCard> {
    const local = await this.store.discardPending(reviewId);
    if (local) {
      return local;
    }

    let result: { outcome: RevertOutcome; card: VersionedCard | null };
    try {
      result = await this.revertReviewOnline(reviewId);
    } catch {
      // Sin conexión no se puede deshacer algo que el servidor ya tiene. Se
      // dice, en vez de fingir que se ha deshecho.
      throw new Error(
        'This rating was already synced and undoing it needs a connection. Try again when you are online.',
      );
    }

    if (result.outcome === 'not_found') {
      throw new Error('This rating could not be found, so it can no longer be undone.');
    }
    if (result.outcome === 'already_reverted') {
      throw new Error('This rating was already undone.');
    }
    if (result.outcome === 'conflict') {
      throw new Error('This card was reviewed again after that rating, so it can no longer be undone.');
    }
    if (!result.card) {
      throw new Error('The reverted card could not be loaded.');
    }

    await this.store.cacheCards([result.card]);
    return result.card;
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
