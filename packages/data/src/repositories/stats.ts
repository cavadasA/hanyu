import type { HanyuClient } from '../client';
import type { Database } from '../database.types';
import { getFlashcardStats } from './flashcards';
import {
  callRpcVariants,
  createRepositoryError,
  getRequiredUserId,
  toDateString,
} from './shared';

type UserStatsRow = Database['public']['Tables']['user_stats']['Row'];

function defaultTodayStats() {
  return {
    cards_reviewed: 0,
    cards_new: 0,
    exercises_done: 0,
    readings_done: 0,
    time_spent_ms: 0,
  };
}

function computeStreakFromDates(descendingDates: string[]) {
  if (!descendingDates.length) {
    return { current: 0, longest: 0 };
  }

  let current = 0;
  const today = toDateString();
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = toDateString(yesterday);

  if (descendingDates[0] === today || descendingDates[0] === yesterdayStr) {
    current = 1;

    for (let index = 1; index < descendingDates.length; index += 1) {
      const previous = new Date(`${descendingDates[index - 1]}T00:00:00Z`).getTime();
      const day = new Date(`${descendingDates[index]}T00:00:00Z`).getTime();
      const diffDays = (previous - day) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        current += 1;
      } else {
        break;
      }
    }
  }

  let longest = descendingDates.length > 0 ? 1 : 0;
  let run = 1;

  for (let index = 1; index < descendingDates.length; index += 1) {
    const previous = new Date(`${descendingDates[index - 1]}T00:00:00Z`).getTime();
    const day = new Date(`${descendingDates[index]}T00:00:00Z`).getTime();
    const diffDays = (previous - day) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  return { current, longest };
}

function normalizeDashboard(payload: any) {
  const today = {
    ...defaultTodayStats(),
    ...(payload?.today || {}),
  };

  return {
    cards: {
      total: payload?.cards?.total || 0,
      due: payload?.cards?.due || 0,
      by_status: payload?.cards?.by_status || {},
    },
    today,
    heatmap: payload?.heatmap || [],
    streak: payload?.streak || { current: 0, longest: 0 },
    learning_curve: payload?.learning_curve || [],
    exercise_stats: payload?.exercise_stats || { by_type: {}, accuracy: null },
    reading_stats: payload?.reading_stats || { total: 0, avg_score: null },
    time: {
      today_ms: payload?.time?.today_ms || today.time_spent_ms || 0,
      week_ms: payload?.time?.week_ms || 0,
      all_time_ms: payload?.time?.all_time_ms || 0,
    },
  };
}

export async function getDashboard(client: HanyuClient) {
  try {
    const rpcData = await callRpcVariants(client, 'get_dashboard', [{}]);
    return normalizeDashboard(Array.isArray(rpcData) ? rpcData[0] : rpcData);
  } catch {
    // Fallback aggregate for environments where the dashboard RPC is not yet deployed.
  }

  const userId = await getRequiredUserId(client);
  const today = toDateString();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);
  const weekAgo = new Date();
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

  const [
    cardStats,
    todayResult,
    heatmapResult,
    weekRowsResult,
    allRowsResult,
    exerciseRowsResult,
    readingCountResult,
    streak,
  ] = await Promise.all([
    getFlashcardStats(client),
    client.from('user_stats').select('*').eq('user_id', userId).eq('date', today).maybeSingle(),
    client
      .from('user_stats')
      .select('date, cards_reviewed, exercises_done, readings_done')
      .eq('user_id', userId)
      .gte('date', toDateString(since))
      .order('date', { ascending: true }),
    client
      .from('user_stats')
      .select('time_spent_ms')
      .eq('user_id', userId)
      .gte('date', toDateString(weekAgo)),
    client.from('user_stats').select('time_spent_ms').eq('user_id', userId),
    client.from('generated_exercises').select('type'),
    client.from('generated_readings').select('*', { count: 'exact', head: true }),
    getStreak(client),
  ]);

  if (todayResult.error) {
    throw createRepositoryError(todayResult.error, 'Failed to load dashboard daily stats');
  }

  if (heatmapResult.error) {
    throw createRepositoryError(heatmapResult.error, 'Failed to load dashboard heatmap');
  }

  if (weekRowsResult.error) {
    throw createRepositoryError(weekRowsResult.error, 'Failed to load weekly time data');
  }

  if (allRowsResult.error) {
    throw createRepositoryError(allRowsResult.error, 'Failed to load total time data');
  }

  if (exerciseRowsResult.error) {
    throw createRepositoryError(exerciseRowsResult.error, 'Failed to load exercise breakdown');
  }

  if (readingCountResult.error) {
    throw createRepositoryError(readingCountResult.error, 'Failed to load reading totals');
  }

  const todayStats = {
    ...defaultTodayStats(),
    ...(todayResult.data || {}),
  };

  const heatmap = ((heatmapResult.data || []) as any[]).map((row) => ({
    date: row.date,
    activity: Number(row.cards_reviewed || 0) + Number(row.exercises_done || 0) + Number(row.readings_done || 0),
  }));

  const byType: Record<string, number> = {};
  for (const row of (exerciseRowsResult.data || []) as any[]) {
    if (row.type) {
      byType[row.type] = (byType[row.type] || 0) + 1;
    }
  }

  const weekMs = ((weekRowsResult.data || []) as any[]).reduce(
    (total, row) => total + Number(row.time_spent_ms || 0),
    0
  );
  const allTimeMs = ((allRowsResult.data || []) as any[]).reduce(
    (total, row) => total + Number(row.time_spent_ms || 0),
    0
  );

  return {
    cards: {
      total: cardStats.total,
      due: cardStats.due,
      by_status: cardStats.by_status,
    },
    today: todayStats,
    heatmap,
    streak,
    learning_curve: [],
    exercise_stats: {
      by_type: byType,
      accuracy: null,
    },
    reading_stats: {
      total: readingCountResult.count || 0,
      avg_score: null,
    },
    time: {
      today_ms: Number((todayStats as any).time_spent_ms || 0),
      week_ms: weekMs,
      all_time_ms: allTimeMs,
    },
  };
}

export async function getStreak(client: HanyuClient) {
  const userId = await getRequiredUserId(client);
  const { data, error } = await client
    .from('user_stats')
    .select('date, cards_reviewed, exercises_done, readings_done')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(365);

  if (error) {
    throw createRepositoryError(error, 'Failed to load streak data');
  }

  const activeDates = ((data || []) as any[])
    .filter(
      (row) =>
        Number(row.cards_reviewed || 0) > 0 ||
        Number(row.exercises_done || 0) > 0 ||
        Number(row.readings_done || 0) > 0
    )
    .map((row) => row.date);

  return computeStreakFromDates(activeDates);
}

export async function logTime(ms: number, client: HanyuClient) {
  const safeMs = Math.max(0, Number(ms) || 0);
  if (!safeMs) {
    return { time_spent_ms: 0 };
  }

  try {
    const rpcData = await callRpcVariants(client, 'log_study_time', [
      { p_ms: safeMs },
      { ms: safeMs },
    ]);
    const payload = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as any;
    return {
      time_spent_ms: Number(payload?.time_spent_ms || safeMs),
    };
  } catch {
    // fallback below
  }

  const userId = await getRequiredUserId(client);
  const today = toDateString();

  const { data: existing, error: existingError } = await client
    .from('user_stats')
    .select('id, time_spent_ms')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (existingError) {
    throw createRepositoryError(existingError, 'Failed to log study time');
  }

  if (existing) {
    const nextValue = Number(existing.time_spent_ms || 0) + safeMs;
    const { error } = await client
      .from('user_stats')
      .update({ time_spent_ms: nextValue } as any)
      .eq('id', existing.id);

    if (error) {
      throw createRepositoryError(error, 'Failed to update study time');
    }

    return { time_spent_ms: nextValue };
  }

  const { error } = await client.from('user_stats').insert({
    user_id: userId,
    date: today,
    time_spent_ms: safeMs,
  } as any);

  if (error) {
    throw createRepositoryError(error, 'Failed to create study time row');
  }

  return { time_spent_ms: safeMs };
}