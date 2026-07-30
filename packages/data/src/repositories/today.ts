import type { HanyuClient } from '../client';
import { getSettings } from './settings';
import { createRepositoryError, getRequiredUserId, toDateString } from './shared';

function defaultTodayStats() {
  return {
    cards_reviewed: 0,
    cards_new: 0,
    exercises_done: 0,
    readings_done: 0,
    time_spent_ms: 0,
  };
}

export async function getToday(client: HanyuClient) {
  const [userId, settings] = await Promise.all([getRequiredUserId(client), getSettings(client)]);
  const today = toDateString();
  const nowIso = new Date().toISOString();
  const currentLevel = Number(settings.current_level || 2);

  const [deckSizeResult, dueResult, statsResult, readingResult] = await Promise.all([
    client.from('srs_cards').select('*', { head: true, count: 'exact' }).eq('user_id', userId),
    client
      .from('srs_cards')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .lte('next_review_at', nowIso),
    client.from('user_stats').select('*').eq('user_id', userId).eq('date', today).maybeSingle(),
    client
      .from('generated_readings')
      .select('id, title, hsk_level, format')
      .eq('hsk_level', Math.min(2, currentLevel))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (deckSizeResult.error) {
    throw createRepositoryError(deckSizeResult.error, 'Failed to load deck size');
  }

  if (dueResult.error) {
    throw createRepositoryError(dueResult.error, 'Failed to load due cards count');
  }

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
      current_level: Math.max(2, currentLevel),
      mode: 'hsk2_consolidation',
    },
    flashcards: {
      deck_size: deckSizeResult.count || 0,
      due: dueResult.count || 0,
      target: Number(settings.cards_per_day || 20),
      completed: Number((todayStats as any).cards_reviewed || 0),
    },
    exercises: {
      target: 5,
      completed: Number((todayStats as any).exercises_done || 0),
    },
    reading: {
      target: 1,
      completed: Number((todayStats as any).readings_done || 0),
      level: 2,
      next: readingResult.data || null,
    },
    progress: {
      completed_blocks: blocks.filter(Boolean).length,
      total_blocks: 3,
    },
  };
}