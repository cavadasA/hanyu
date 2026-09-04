import type { HanyuClient } from '../client';
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

export async function getToday(client: HanyuClient) {
  const [userId, settings] = await Promise.all([getRequiredUserId(client), getSettings(client)]);
  const today = toDateString();
  const currentLevel = Number(settings.current_level ?? 2);

  const [deckSizeRpc, dueRpc, statsResult, readingResult] = await Promise.all([
    callRpcVariants(client, 'count_deck_cards', [{ p_deck_id: null, p_due_only: false }]),
    callRpcVariants(client, 'count_deck_cards', [{ p_deck_id: null, p_due_only: true }]),
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
  };
}
