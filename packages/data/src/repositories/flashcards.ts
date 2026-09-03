import type { HanyuClient } from '../client';
import { cardPhase, emptyState, schedulingParams } from '@hanyu/domain';
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
  BuildQueueInput,
} from '../types';
import { getSettings } from './settings';
import {
  createRepositoryError,
  getRequiredUserId,
} from './shared';

const WORD_SELECT =
  'id, hanzi, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency, sense_index, variants';

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
    is_new: Boolean(row.is_new),
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
    sense_index: relatedWord?.sense_index ?? null,
    variants: relatedWord?.variants ?? [],
    context: row.context ?? null,
  };
}

async function loadLatestWordContexts(
  wordIds: number[],
  client: HanyuClient,
): Promise<Map<number, WordContext>> {
  if (wordIds.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from('word_context')
    .select('word_id, sentence, source_kind, source_id, created_at')
    .in('word_id', wordIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw createRepositoryError(error, 'Failed to load word context');
  }

  const latest = new Map<number, WordContext>();
  for (const row of data ?? []) {
    const wordId = Number((row as any).word_id);
    if (latest.has(wordId)) {
      continue;
    }
    latest.set(wordId, {
      sentence: String((row as any).sentence),
      source_kind: 'reading',
      source_id: String((row as any).source_id ?? ''),
    });
  }

  return latest;
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
  const maxFromSettings = settings.session_size || 20;
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

  const contextByWord = await loadLatestWordContexts(
    [...new Set(rows.map((row) => Number(row.word_id)))],
    client,
  );
  rows = rows.map((row) => ({
    ...row,
    context: contextByWord.get(Number(row.word_id)) ?? null,
  }));

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

/**
 * La cola llega ya decidida: qué entra hoy y cuánto son reglas sobre el
 * conjunto completo de tarjetas, y solo se pueden aplicar donde está ese
 * conjunto. Este repositorio no recorta ni reordena; el orden fino lo pone
 * `orderQueue` del paquete de dominio, que necesita la curva de olvido.
 */
export async function buildQueue(
  input: BuildQueueInput,
  client: HanyuClient,
): Promise<{ cards: VersionedCard[] }> {
  const { data, error } = await (client.rpc as any)('build_review_queue', {
    p_deck_id: input.deckId ?? null,
    p_skill: input.skill ?? 'recognition',
    p_limit: input.limit ?? null,
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to build the study queue');
  }

  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    return { cards: [] };
  }

  const { data: words, error: wordsError } = await client
    .from('words')
    .select(WORD_SELECT)
    .in('id', rows.map((row) => Number(row.word_id)));

  if (wordsError) {
    throw createRepositoryError(wordsError, 'Failed to load queue words');
  }

  const byId = new Map((words ?? []).map((word: any) => [Number(word.id), word]));

  return {
    cards: rows.map((row) => ({
      ...mapVersionedCardRow(row, byId.get(Number(row.word_id))),
      is_new: Boolean(row.is_new),
    })),
  };
}

export async function getCard(
  id: string,
  client: HanyuClient,
  skill: LearningSkill = 'recognition',
): Promise<VersionedCard> {
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
    .eq('skill', skill)
    .maybeSingle();

  if (stateError) {
    throw createRepositoryError(stateError, 'Failed to load card scheduling state');
  }

  const fallback = emptyState(new Date());
  const cardRow = data as any;
  const stateRow = (state as any) ?? {
    skill,
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
    p_time_ms: event.time_ms,
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to sync review');
  }

  const outcome = normalizeReviewSyncOutcome(data);
  const card = await getCard(event.card_id, client, event.skill);

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

export async function createStudyPlan(levels: number[], client: HanyuClient) {
  const { data, error } = await (client.rpc as any)('create_study_plan', { p_levels: levels });

  if (error) {
    throw createRepositoryError(error, 'Failed to create the study plan');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { deck_id: String(row?.deck_id ?? ''), scope_size: Number(row?.scope_size ?? 0) };
}

export async function submitDiagnostic(
  results: Array<{ word_id: number; known: boolean }>,
  client: HanyuClient,
) {
  const { data, error } = await (client.rpc as any)('submit_diagnostic', { p_results: results });

  if (error) {
    throw createRepositoryError(error, 'Failed to save the diagnostic');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { suspended: Number(row?.suspended ?? 0), queued: Number(row?.queued ?? 0) };
}

export async function getFlashcardStats(client: HanyuClient) {
  const userId = await getRequiredUserId(client);
  const now = new Date();
  const nowIso = now.toISOString();
  const params = schedulingParams({ request_retention: (await getSettings(client)).request_retention });

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
    }, now, params);
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
