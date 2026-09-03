import type { HanyuClient } from '../client';
import { cardPhase, emptyState } from '@hanyu/domain';
import type {
  RevertReviewResult,
  RevertOutcome,
  ReviewEvent,
  ReviewSyncResult,
  SchedulingPhase,
  SchedulingState,
  VersionedCard,
  LearningSkill,
  WordContext,
} from '../types';
import { getSettings } from './settings';
import {
  callRpcVariants,
  createRepositoryError,
  getRequiredUserId,
} from './shared';

const WORD_SELECT =
  'id, hanzi, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency';

/**
 * Las habilidades que una palabra puede ejercitar hoy dependen del material
 * que exista para ella, no de un catálogo fijo. `production` está declarada en
 * el enum desde el Plan 1C pero no se genera: sin evaluación de voz sería una
 * tarjeta imposible de aprobar.
 */
export function availableSkills(input: { hasContext: boolean }): LearningSkill[] {
  const skills: LearningSkill[] = ['recognition', 'recall', 'listening'];

  if (input.hasContext) {
    skills.push('reading');
  }

  return skills;
}

function mapVersionedCardRow(row: any, word?: any): VersionedCard {
  if (row.version === undefined || row.version === null) {
    throw createRepositoryError(new Error('Card version is missing'), 'Failed to load card');
  }

  const relatedWord = word ?? (Array.isArray(row.words) ? row.words[0] : row.words);

  return {
    id: String(row.card_id ?? row.id),
    user_id: String(row.user_id ?? ''),
    word_id: Number(row.word_id),
    skill: (row.skill ?? 'recognition') as VersionedCard['skill'],
    scheduling: {
      difficulty: Number(row.difficulty ?? 0),
      stability: Number(row.stability ?? 0),
      reps: Number(row.reps ?? 0),
      lapses: Number(row.lapses ?? 0),
      learning_steps: Number(row.learning_steps ?? 0),
      scheduled_days: Number(row.scheduled_days ?? 0),
      elapsed_days: Number(row.elapsed_days ?? 0),
      state: (row.fsrs_state ?? 'new') as SchedulingPhase,
      due: String(row.next_review_at ?? new Date().toISOString()),
      last_review: row.last_reviewed_at ? String(row.last_reviewed_at) : null,
    } satisfies SchedulingState,
    version: Number(row.version),
    hanzi: relatedWord?.hanzi,
    pinyin: relatedWord?.pinyin,
    traditional: relatedWord?.traditional ?? null,
    meaning_en: relatedWord?.meaning_en,
    meaning_es: relatedWord?.meaning_es ?? null,
    classifier: relatedWord?.classifier ?? null,
    hsk_level: relatedWord?.hsk_level,
    pos: relatedWord?.pos ?? null,
    frequency: relatedWord?.frequency ?? null,
  };
}

type ReviewSyncOutcome = ReviewSyncResult['outcome'];

function normalizeReviewSyncOutcome(data: unknown): ReviewSyncOutcome {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== 'object') {
    throw createRepositoryError(
      new Error('Failed to sync review'),
      'Failed to sync review'
    );
  }

  const outcome = (row as { outcome?: unknown }).outcome;
  if (outcome !== 'applied' && outcome !== 'duplicate' && outcome !== 'conflict') {
    throw createRepositoryError(
      new Error('Failed to sync review'),
      'Failed to sync review'
    );
  }

  return outcome;
}

export async function getDueCards(
  limit: number = 50,
  client: HanyuClient,
  deckId: string | null = null,
  skill: LearningSkill = 'recognition',
) {
  const settings = await getSettings(client);
  const maxFromSettings = settings.max_reviews_per_session || 100;
  const requestedLimit = Math.max(1, parseInt(String(limit), 10) || maxFromSettings);
  const effectiveLimit = Math.min(maxFromSettings, requestedLimit);

  const { data, error } = await (client.rpc as any)('get_due_cards', {
    p_limit: effectiveLimit,
    p_deck_id: deckId,
    p_skill: skill,
  });
  if (error) {
    throw createRepositoryError(error, 'Failed to load due cards');
  }

  // The RPC returns skill-state rows, so attach word details when missing.
  let rows = (data || []) as any[];
  if (rows.some((row) => !row.words)) {
    const wordIds = [...new Set(rows.map((row) => row.word_id))];
    if (wordIds.length > 0) {
      const { data: wordRows, error: wordError } = await client
        .from('words')
        .select(WORD_SELECT)
        .in('id', wordIds);
      if (wordError) {
        throw createRepositoryError(wordError, 'Failed to load card words');
      }
      const byId = new Map((wordRows || []).map((w: any) => [String(w.id), w]));
      rows = rows.map((row) => ({ ...row, words: byId.get(String(row.word_id)) ?? null }));
    }
  }

  // deck_size = distinct words in scope (active decks, or the focused deck).
  const { data: sizeData, error: sizeError } = await (client.rpc as any)('count_deck_cards', {
    p_deck_id: deckId,
    p_due_only: false,
  });
  if (sizeError) {
    throw createRepositoryError(sizeError, 'Failed to load deck size');
  }
  const deckSize = Number((Array.isArray(sizeData) ? sizeData[0] : sizeData)?.count || 0);

  let cards = rows.map((row) => mapVersionedCardRow(row));
  if (settings.card_order === 'frequency') {
    cards = cards
      .slice()
      .sort((a, b) => {
        const freqA = Number.isFinite(Number(a.frequency)) ? Number(a.frequency) : Number.MAX_SAFE_INTEGER;
        const freqB = Number.isFinite(Number(b.frequency)) ? Number(b.frequency) : Number.MAX_SAFE_INTEGER;

        if (freqA !== freqB) {
          return freqA - freqB;
        }

        const dateA = new Date(a.scheduling.due).getTime();
        const dateB = new Date(b.scheduling.due).getTime();
        return dateA - dateB;
      });
  }

  return {
    cards,
    total: cards.length,
    deck_size: deckSize || 0,
  };
}

export async function getCard(id: string, client: HanyuClient): Promise<VersionedCard> {
  const userId = await getRequiredUserId(client);

  const { data, error } = await client
    .from('srs_cards')
    .select(
      `id, user_id, word_id, version, words:word_id(${WORD_SELECT})`,
    )
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw createRepositoryError(error, 'Failed to load card');
  }

  if (!data) {
    const notFound = new Error('Card not found') as Error & { status?: number };
    notFound.status = 404;
    throw notFound;
  }

  const { data: state, error: stateError } = await client
    .from('learner_skill_state')
    .select(
      'skill, difficulty, stability, reps, lapses, learning_steps, scheduled_days, elapsed_days, fsrs_state, next_review_at, last_reviewed_at, version',
    )
    .eq('user_id', userId)
    .eq('target_kind', 'word')
    .eq('target_id', data.word_id)
    .eq('skill', 'recognition')
    .maybeSingle();

  if (stateError) {
    throw createRepositoryError(stateError, 'Failed to load card scheduling state');
  }

  const fallback = emptyState(new Date());
  const cardRow = data as any;
  const stateRow = (state as any) ?? {
    skill: 'recognition',
    difficulty: fallback.difficulty,
    stability: fallback.stability,
    reps: fallback.reps,
    lapses: fallback.lapses,
    learning_steps: fallback.learning_steps,
    scheduled_days: fallback.scheduled_days,
    elapsed_days: fallback.elapsed_days,
    fsrs_state: fallback.state,
    next_review_at: fallback.due,
    last_reviewed_at: fallback.last_review,
  };
  return mapVersionedCardRow(
    {
      ...cardRow,
      ...stateRow,
    },
  );
}

export async function reviewCardEvent(event: ReviewEvent, client: HanyuClient): Promise<ReviewSyncResult> {
  const { data, error } = await (client.rpc as any)('apply_review', {
    p_card_id: event.card_id,
    p_review_id: event.review_id,
    p_reviewed_at: event.reviewed_at,
    p_expected_version: event.expected_version,
    p_grade: event.grade,
    p_skill: event.skill,
    p_state: event.state,
    p_prior: event.prior,
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to sync review');
  }

  const outcome = normalizeReviewSyncOutcome(data);
  const card = await getCard(event.card_id, client);

  return { outcome, card };
}

/**
 * Revierte en servidor una valoración ya sincronizada.
 *
 * Devuelve el resultado en vez de lanzar cuando la reversión no se aplica:
 * 'conflict' y 'already_reverted' son respuestas legítimas del servidor que la
 * interfaz tiene que poder explicar, no fallos.
 */
export async function revertReview(
  reviewId: string,
  client: HanyuClient,
): Promise<RevertReviewResult> {
  const { data, error } = await (client.rpc as any)('revert_review', {
    p_review_id: reviewId,
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to revert review');
  }

  const row = Array.isArray(data) ? data[0] : data;
  const outcome = String((row as any)?.outcome ?? 'not_found') as RevertOutcome;
  if (outcome === 'not_found') {
    return { outcome, card: null };
  }

  const cardId = (row as any)?.card_id;
  if (typeof cardId !== 'string' || cardId.length === 0) {
    throw createRepositoryError(new Error('Revert response is missing card_id'), 'Failed to revert review');
  }

  const card = await getCard(cardId, client);

  return { outcome, card };
}

export async function addCard(
  wordId: number | string,
  client: HanyuClient,
  options: { deckId?: string; context?: WordContext } = {},
) {
  const userId = await getRequiredUserId(client);
  const numericWordId = Number(wordId);

  // Ensure the shared SRS card (idempotent; never reset an existing one).
  const { error: cardError } = await client
    .from('srs_cards')
    .upsert(
      { user_id: userId, word_id: numericWordId } as any,
      { onConflict: 'user_id,word_id', ignoreDuplicates: true }
    );
  if (cardError) throw createRepositoryError(cardError, 'Failed to add card');

  for (const skill of availableSkills({ hasContext: Boolean(options.context) })) {
    const { error: stateError } = await client
      .from('learner_skill_state')
      .upsert(
        {
          user_id: userId,
          target_kind: 'word',
          target_id: numericWordId,
          skill,
          suspended: skill !== 'recognition',
        } as any,
        { onConflict: 'user_id,target_kind,target_id,skill', ignoreDuplicates: true },
      );
    if (stateError) throw createRepositoryError(stateError, 'Failed to initialize card scheduling state');
  }

  if (options.context) {
    const { error: contextError } = await client
      .from('word_context')
      .upsert(
        {
          user_id: userId,
          word_id: numericWordId,
          sentence: options.context.sentence,
          source_kind: options.context.source_kind,
          source_id: options.context.source_id,
        } as any,
        { onConflict: 'user_id,word_id,sentence', ignoreDuplicates: true },
      );
    if (contextError) throw createRepositoryError(contextError, 'Failed to save word context');
  }

  // Resolve target deck (explicit, else the default deck).
  let targetDeckId = options.deckId;
  if (!targetDeckId) {
    const { data: def } = await client
      .from('decks')
      .select('id')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle();
    targetDeckId = (def as any)?.id;
  }
  if (targetDeckId) {
    const { error: memberError } = await client
      .from('deck_cards')
      .upsert({ deck_id: targetDeckId, word_id: numericWordId } as any, {
        onConflict: 'deck_id,word_id',
      });
    if (memberError) throw createRepositoryError(memberError, 'Failed to add word to deck');
  }

  return { word_id: numericWordId, deck_id: targetDeckId ?? null };
}

export async function createStarterDeck(input: { strategy?: string; limit?: number } = {}, client: HanyuClient) {
  const strategy = input.strategy || 'hsk2_consolidation';
  const limit = input.limit === undefined ? null : parseInt(String(input.limit), 10);

  const result = await callRpcVariants(client, 'create_starter_deck', [
    { strategy, p_limit: limit },
    { strategy, limit },
    { p_strategy: strategy, p_limit: limit },
  ]);

  const payload = (Array.isArray(result) ? result[0] : result) as any;
  return {
    inserted: payload?.inserted || 0,
    total_deck_size: payload?.total_deck_size || payload?.deck_size || 0,
  };
}

export async function getFlashcardStats(client: HanyuClient) {
  const userId = await getRequiredUserId(client);
  const nowIso = new Date().toISOString();

  const [totalResult, dueResult, statusResult, levelResult] = await Promise.all([
    client.from('srs_cards').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    client
      .from('learner_skill_state')
      .select('next_review_at', { count: 'exact' })
      .eq('user_id', userId)
      .eq('target_kind', 'word')
      .eq('skill', 'recognition')
      .eq('suspended', false),
    client
      .from('learner_skill_state')
      .select('fsrs_state, difficulty, stability, reps, lapses, learning_steps, scheduled_days, elapsed_days, next_review_at, last_reviewed_at')
      .eq('user_id', userId)
      .eq('target_kind', 'word')
      .eq('skill', 'recognition'),
    client
      .from('srs_cards')
      .select('word_id, words:word_id(hsk_level)')
      .eq('user_id', userId),
  ]);

  if (totalResult.error) {
    throw createRepositoryError(totalResult.error, 'Failed to load flashcard totals');
  }

  if (dueResult.error) {
    throw createRepositoryError(dueResult.error, 'Failed to load due count');
  }

  if (statusResult.error) {
    throw createRepositoryError(statusResult.error, 'Failed to load status breakdown');
  }

  if (levelResult.error) {
    throw createRepositoryError(levelResult.error, 'Failed to load level breakdown');
  }

  const byStatus: Record<string, number> = {};
  for (const row of (statusResult.data || []) as any[]) {
    const phase = cardPhase({
      difficulty: Number(row.difficulty ?? 0),
      stability: Number(row.stability ?? 0),
      reps: Number(row.reps ?? 0),
      lapses: Number(row.lapses ?? 0),
      learning_steps: Number(row.learning_steps ?? 0),
      scheduled_days: Number(row.scheduled_days ?? 0),
      elapsed_days: Number(row.elapsed_days ?? 0),
      state: row.fsrs_state ?? 'new',
      due: String(row.next_review_at ?? nowIso),
      last_review: row.last_reviewed_at ? String(row.last_reviewed_at) : null,
    });
    byStatus[phase] = (byStatus[phase] || 0) + 1;
  }

  const byLevel: Record<string, number> = {};
  for (const row of (levelResult.data || []) as any[]) {
    const relation = Array.isArray(row.words) ? row.words[0] : row.words;
    const level = relation?.hsk_level;
    if (level !== undefined && level !== null) {
      byLevel[level] = (byLevel[level] || 0) + 1;
    }
  }

  return {
    total: totalResult.count || 0,
    due: ((dueResult.data || []) as any[]).filter(
      (row) => row.next_review_at === null || row.next_review_at <= nowIso,
    ).length,
    by_status: byStatus,
    by_level: byLevel,
  };
}
