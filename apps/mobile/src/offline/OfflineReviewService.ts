/**
 * OfflineReviewService – pure TypeScript, zero React/Expo-native imports.
 *
 * Wraps a ReviewStore with a cache-first load strategy and local FSRS rating.
 * All I/O dependencies (store, clock, uuid, online fetch) are constructor-injected
 * so that the class can be tested in plain Node/Jest without any native modules.
 */

import type { LearningSkill, RevertOutcome, StudyMode, VersionedCard, ReviewEvent } from '@hanyu/data';
import { applyReview, orderQueue, type Grade, type QueueStrategy } from '@hanyu/domain';
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
   * Narrow shape needed from HanyuData['flashcards']['buildQueue'].
   * Kept this way intentionally: we only need cards, and we need the return
   * typed as unknown[] so we can do our own runtime version validation.
   */
  buildQueueOnline: (input: {
    skill: LearningSkill;
    deckId: string | null;
    mode?: StudyMode;
  }) => Promise<{ cards: unknown[]; deck_size?: number | null }>;
  /** The server selects the queue; this strategy orders that selected set. */
  cardOrder: () => QueueStrategy;
  /** Injected clock – production default: `() => new Date()`. */
  now: () => Date;
  /** Injected id generator – production default: expo-crypto randomUUID. */
  uuid: () => string;
  /** Scheduling parameters owned by the provider's in-memory cache. */
  params: () => FSRSParameters;
  /**
   * Revierte en servidor una valoración ya sincronizada. Inyectada como el
   * resto de la E/S para que el servicio siga siendo probable en Node puro.
   */
  revertReviewOnline: (reviewId: string) => Promise<{ outcome: RevertOutcome; card: VersionedCard | null }>;
}

export class OfflineReviewService {
  private readonly store: ReviewStore;
  private readonly buildQueueOnlineImpl: (input: {
    skill: LearningSkill;
    deckId: string | null;
    mode?: StudyMode;
  }) => Promise<{ cards: unknown[]; deck_size?: number | null }>;
  private readonly cardOrder: () => QueueStrategy;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  private readonly params: () => FSRSParameters;
  private readonly revertReviewOnline: (
    reviewId: string,
  ) => Promise<{ outcome: RevertOutcome; card: VersionedCard | null }>;
  /** Per-card-id synchronous double-tap guard. */
  private readonly inFlight = new Set<string>();
  private _lastDeckSize: number | null = null;
  private _lastQueueError: string | null = null;

  get lastDeckSize(): number | null {
    return this._lastDeckSize;
  }

  get lastQueueError(): string | null {
    return this._lastQueueError;
  }

  constructor(deps: OfflineReviewServiceDeps) {
    this.store = deps.store;
    this.buildQueueOnlineImpl = deps.buildQueueOnline;
    this.cardOrder = deps.cardOrder;
    this.now = deps.now;
    this.uuid = deps.uuid;
    this.params = deps.params;
    this.revertReviewOnline = deps.revertReviewOnline;
  }

  /**
   * La cola la decide el servidor; aquí solo se ordena lo que llega. Review
   * puede caer a la caché local si no hay red, pero Learn y Exam no pueden
   * reutilizar esa cola porque sus subconjuntos tienen otra semántica.
   */
  async loadQueue(
    skill: LearningSkill = 'recognition',
    deckId: string | null = null,
    mode: StudyMode = 'review',
  ): Promise<VersionedCard[]> {
    const nowIso = this.now().toISOString();
    const cached = await this.store.getDueProjectedCards(nowIso, 200);
    this._lastQueueError = null;

    try {
      const online = await this.buildQueueOnlineImpl({
        skill,
        deckId,
        mode,
      });
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
            `Card "${String(c.id)}" returned by buildQueue is missing the version field`,
          );
        }
        freshCards.push(c as unknown as VersionedCard);
      }

      this._lastDeckSize =
        typeof online.deck_size === 'number' && Number.isFinite(online.deck_size)
          ? online.deck_size
          : null;

      await this.store.cacheCards(freshCards);
      return orderQueue(freshCards, this.now(), this.params(), this.cardOrder());
    } catch (caught) {
      this._lastQueueError = caught instanceof Error ? caught.message : String(caught);
      this._lastDeckSize = null;
      if (mode !== 'review') {
        // A review cache is not a valid Learn/Exam queue: returning it would
        // make a mode-specific server failure look like a successful session.
        return [];
      }
      return orderQueue(cached, this.now(), this.params(), this.cardOrder());
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
      const params = this.params();
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
