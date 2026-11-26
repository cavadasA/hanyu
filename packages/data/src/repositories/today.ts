import type { HanyuClient } from '../client';
import { buildDailyPlan, type LearnerModel } from '@hanyu/domain';
import type { HskLevel } from '../types';
import { getReadingPlannerInput } from './readings';
import { getSettings } from './settings';
import { callRpcVariants, createRepositoryError, getRequiredUserId, toDateString } from './shared';

/** Ejercicios al día que cuentan como bloque completado en Hoy. */
const EXERCISES_TARGET = 5;

// El planificador necesita el catálogo entero para puntuarlo, pero la respuesta
// de Today solo publica la ficha de la siguiente lectura. Se proyecta a las
// mismas columnas de antes para no arrastrar sus frases y preguntas completas
// en cada carga de la pantalla de inicio.
const NEXT_READING_FIELDS = [
  'slug',
  'title',
  'hsk_level',
  'format',
  'topic',
  'series',
  'series_index',
  'audio_kind',
] as const;

function toNextReading(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;

  const next: Record<string, unknown> = {};
  for (const field of NEXT_READING_FIELDS) {
    if (row[field] !== undefined) {
      next[field] = row[field];
    }
  }
  return next;
}

function defaultTodayStats() {
  return {
    cards_reviewed: 0,
    cards_new: 0,
    exercises_done: 0,
    readings_done: 0,
    time_spent_ms: 0,
  };
}

function countFromRpc(payload: unknown) {
  const row = (Array.isArray(payload) ? payload[0] : payload) as any;
  return Number(row?.count || 0);
}

function isMissingRpcError(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'PGRST202',
  );
}

async function optionalRpc(
  client: HanyuClient,
  rpcName: string,
  args: Record<string, unknown>,
) {
  try {
    return await callRpcVariants(client, rpcName, [args]);
  } catch (error) {
    if (isMissingRpcError(error)) {
      return null;
    }
    throw error;
  }
}

async function loadLearnQueue(client: HanyuClient) {
  const modeQueue = await optionalRpc(client, 'build_review_queue_mode', {
    p_mode: 'learn',
    p_deck_id: null,
    p_skill: 'recognition',
    p_limit: null,
  });

  if (modeQueue !== null) {
    return modeQueue;
  }

  return optionalRpc(client, 'build_review_queue', {
    p_deck_id: null,
    p_skill: 'recognition',
    p_limit: null,
  });
}

export async function getToday(client: HanyuClient) {
  const [userId, settings] = await Promise.all([getRequiredUserId(client), getSettings(client)]);
  const today = toDateString();
  const currentLevel = Number(settings.current_level ?? 2);

  const [deckSizeRpc, dueRpc, dueStateRpc, statsResult, readingInput, unitData, queueData] = await Promise.all([
    callRpcVariants(client, 'count_deck_cards', [{ p_deck_id: null, p_due_only: false }]),
    callRpcVariants(client, 'count_deck_cards', [{ p_deck_id: null, p_due_only: true }]),
    optionalRpc(client, 'count_due_cards_by_state', { p_deck_id: null, p_skill: 'recognition' }),
    client.from('user_stats').select('*').eq('user_id', userId).eq('date', today).maybeSingle(),
    getReadingPlannerInput(currentLevel as HskLevel, userId, client),
    optionalRpc(client, 'active_unit', {}),
    loadLearnQueue(client),
  ]);

  if (statsResult.error) {
    throw createRepositoryError(statsResult.error, 'Failed to load daily stats');
  }

  const todayStats = {
    ...defaultTodayStats(),
    ...(statsResult.data || {}),
  };

  const blocks = [
    Number((todayStats as any).cards_reviewed || 0) > 0,
    Number((todayStats as any).exercises_done || 0) >= EXERCISES_TARGET,
    Number((todayStats as any).readings_done || 0) >= 1,
  ];

  const unitRow = Array.isArray(unitData) ? unitData[0] : unitData;
  const dueStateRow = (Array.isArray(dueStateRpc) ? dueStateRpc[0] : dueStateRpc) as {
    regular_due_count?: number;
    relearning_count?: number;
  } | null;
  const queue = (queueData ?? []) as Array<{ is_new: boolean; fsrs_state: string; word_id?: number }>;

  // Lo que se está aprendiendo ahora sale de la cola de aprendizaje, que ya
  // está cargada: son las tarjetas que el usuario tiene abiertas hoy. La unidad
  // activa daría el temario, no lo que de verdad está en juego esta sesión.
  const learner: LearnerModel = {
    target_word_ids: [...new Set(
      queue.map(row => Number(row.word_id)).filter(id => Number.isFinite(id)),
    )],
    known_word_ids: readingInput.known_word_ids,
    recent_content_ids: readingInput.recent_content_ids,
    covered_topics: readingInput.covered_topics,
  };

  const plan = buildDailyPlan({
    due_reviews: dueStateRow ? Number(dueStateRow.regular_due_count ?? 0) : countFromRpc(dueRpc),
    relearning: dueStateRow ? Number(dueStateRow.relearning_count ?? 0) : 0,
    review_completed: Number((todayStats as any).cards_reviewed || 0),
    review_target: Number(settings.review_limit_per_day ?? 200),
    active_unit: unitRow
      ? {
          code: String(unitRow.code),
          title: String(unitRow.title),
          total_words: Number(unitRow.total_words),
          settled_words: Number(unitRow.settled_words),
          hsk_level: Number(unitRow.hsk_level),
          word_count: Number(unitRow.word_count ?? unitRow.total_words),
          pattern_count: Number(unitRow.pattern_count ?? 0),
          grammar_id: unitRow.grammar_id == null ? undefined : Number(unitRow.grammar_id),
          total_items: Number(unitRow.total_items ?? unitRow.total_words),
          settled_items: Number(unitRow.settled_items ?? unitRow.settled_words),
        }
      : null,
    new_allowance: queue.filter((row) => row.is_new).length,
    deck_size: countFromRpc(deckSizeRpc),
    new_quota_left: Math.max(
      0,
      Number(settings.new_cards_per_day ?? 10) - Number((todayStats as any).cards_new || 0),
    ),
    readings: readingInput.rankable,
    // Hay catálogo pero no se ha podido puntuar: el paso lo dice en vez de
    // afirmar que no hay lecturas.
    readings_unavailable: readingInput.rows.length > 0 && readingInput.rankable.length === 0,
    // El banco de ejercicios todavía no se rankea, pero la unidad activa tiene su
    // sesión de ejercicios en Practice: el paso lleva allí con la meta del día.
    exercises: [],
    unit_exercises: {
      completed: Number((todayStats as any).exercises_done || 0),
      target: EXERCISES_TARGET,
    },
    exam_date: (settings as { exam_date?: string | null }).exam_date ?? null,
    learner,
  });

  const chosen = plan.steps.find(step => step.kind === 'reading' && step.status === 'ready');
  const chosenSlug = chosen ? String((chosen.payload as { id?: unknown })?.id ?? '') : '';
  // La tarjeta de hoy enseña la lectura que el plan eligió. Cuando el plan no
  // tiene ninguna, la primera sin terminar; una lectura ya leída no vuelve a
  // ofrecerse como "la siguiente".
  const nextReading =
    readingInput.rows.find(row => String(row.slug) === chosenSlug) ??
    readingInput.rows.find(row => !readingInput.finished_slugs.includes(String(row.slug))) ??
    null;

  return {
    profile: {
      current_level: currentLevel,
    },
    flashcards: {
      deck_size: countFromRpc(deckSizeRpc),
      due: countFromRpc(dueRpc),
      new_target: Number(settings.new_cards_per_day ?? 10),
      review_target: Number(settings.review_limit_per_day ?? 200),
      completed: Number((todayStats as any).cards_reviewed || 0),
    },
    exercises: {
      target: EXERCISES_TARGET,
      completed: Number((todayStats as any).exercises_done || 0),
    },
    reading: {
      target: 1,
      completed: Number((todayStats as any).readings_done || 0),
      level: currentLevel,
      next: toNextReading(nextReading),
    },
    progress: {
      completed_blocks: blocks.filter(Boolean).length,
      total_blocks: 3,
    },
    steps: plan.steps,
  };
}
