import type { HanyuClient } from '../client';
import { buildDailyPlan } from '@hanyu/domain';
import { getSettings } from './settings';
import { callRpcVariants, createRepositoryError, getRequiredUserId, toDateString } from './shared';

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

  const [deckSizeRpc, dueRpc, dueStateRpc, statsResult, readingResult, unitData, queueData] = await Promise.all([
    callRpcVariants(client, 'count_deck_cards', [{ p_deck_id: null, p_due_only: false }]),
    callRpcVariants(client, 'count_deck_cards', [{ p_deck_id: null, p_due_only: true }]),
    optionalRpc(client, 'count_due_cards_by_state', { p_deck_id: null, p_skill: 'recognition' }),
    client.from('user_stats').select('*').eq('user_id', userId).eq('date', today).maybeSingle(),
    client
      .from('reading')
      .select('slug, title, hsk_level, format, topic, series, series_index, audio_kind, audio_url')
      .eq('hsk_level', currentLevel)
      .order('series', { ascending: true, nullsFirst: false })
      .order('series_index', { ascending: true, nullsFirst: false })
      .order('slug', { ascending: true })
      .limit(1)
      .maybeSingle(),
    optionalRpc(client, 'active_unit', {}),
    loadLearnQueue(client),
  ]);

  if (statsResult.error) {
    throw createRepositoryError(statsResult.error, 'Failed to load daily stats');
  }

  if (readingResult.error) {
    throw createRepositoryError(readingResult.error, 'Failed to load next reading');
  }

  const todayStats = {
    ...defaultTodayStats(),
    ...(statsResult.data || {}),
  };

  const blocks = [
    Number((todayStats as any).cards_reviewed || 0) > 0,
    Number((todayStats as any).exercises_done || 0) >= 5,
    Number((todayStats as any).readings_done || 0) >= 1,
  ];

  const unitRow = Array.isArray(unitData) ? unitData[0] : unitData;
  const dueStateRow = (Array.isArray(dueStateRpc) ? dueStateRpc[0] : dueStateRpc) as {
    regular_due_count?: number;
    relearning_count?: number;
  } | null;
  const queue = (queueData ?? []) as Array<{ is_new: boolean; fsrs_state: string }>;
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
    // El catálogo de contenido se consulta aquí cuando exista; mientras tanto
    // el planificador devuelve el hueco declarado en vez de inventar material.
    readings: [],
    exercises: [],
    exam_date: (settings as { exam_date?: string | null }).exam_date ?? null,
  });

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
      target: 5,
      completed: Number((todayStats as any).exercises_done || 0),
    },
    reading: {
      target: 1,
      completed: Number((todayStats as any).readings_done || 0),
      level: currentLevel,
      next: readingResult.data || null,
    },
    progress: {
      completed_blocks: blocks.filter(Boolean).length,
      total_blocks: 3,
    },
    steps: plan.steps,
  };
}
