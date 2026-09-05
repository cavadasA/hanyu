import type { HanyuClient } from '../client';
import type { Database } from '../database.types';
import type { LearningReport } from '../types';
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
    client.from('reading').select('*', { count: 'exact', head: true }),
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

// Jerarquía del mapeo 1 ↔ again:
// 1. Canónica: en la BD apply_review guarda grade como 1..4 (types.ts:395).
// 2. Frontera API: la RPC learning_report() mapea 1..4 a 'again'..'easy'.
// 3. Repositorio (aquí): normalizeReportGrade garantiza que si una llamada
//    directa, cliente desactualizado o mock devuelve '1'..'4', el cliente
//    reciba siempre strings canónicos.
// 4. Dominio: isAgain actúa como salvaguarda adicional de cálculo en retention.ts.
function normalizeReportGrade(grade: any): string {
  const g = String(grade ?? '').trim().toLowerCase();
  if (g === '1' || g === 'again') return 'again';
  if (g === '2' || g === 'hard') return 'hard';
  if (g === '3' || g === 'good') return 'good';
  if (g === '4' || g === 'easy') return 'easy';
  return g;
}

export async function getLearningReport(
  client: HanyuClient,
  days: number = 90,
): Promise<LearningReport> {
  const { data, error } = await (client.rpc as any)('learning_report', { p_days: days });
  if (error) {
    throw createRepositoryError(error, 'Failed to load learning report');
  }

  const payload = (typeof data === 'object' && data !== null ? data : {}) as Record<string, any>;
  const rawReviews = Array.isArray(payload.reviews) ? payload.reviews : [];
  const rawReadingSessions = Array.isArray(payload.reading_sessions) ? payload.reading_sessions : [];
  const rawReadingAttempts = Array.isArray(payload.reading_attempts) ? payload.reading_attempts : [];
  const rawUnits = Array.isArray(payload.units) ? payload.units : [];
  const rawSkillStates = Array.isArray(payload.skill_states) ? payload.skill_states : [];

  return {
    reviews: rawReviews.map((r: any) => ({
      occurred_at: String(r.occurred_at ?? ''),
      grade: normalizeReportGrade(r.grade),
      skill: String(r.skill ?? ''),
      phase_before: r.phase_before != null ? String(r.phase_before) : null,
    })),
    attempts: Array.isArray(payload.attempts) ? payload.attempts : [],
    lookups: typeof payload.lookups === 'number' ? payload.lookups : Number(payload.lookups || 0),
    reading_sessions: rawReadingSessions.map((s: any) => ({
      slug: String(s.slug ?? ''),
      seconds: Number(s.seconds || 0),
      pinyin_shown: typeof s.pinyin_shown === 'boolean' ? s.pinyin_shown : null,
      chars: Number(s.chars || 0),
    })),
    skill_states: rawSkillStates.map((s: any) => ({
      target_id: Number(s.target_id),
      skill: String(s.skill ?? ''),
      stability: s.stability !== null && s.stability !== undefined ? Number(s.stability) : null,
      suspended: Boolean(s.suspended),
      last_reviewed_at: s.last_reviewed_at ? String(s.last_reviewed_at) : null,
      in_scope: s.in_scope !== undefined ? Boolean(s.in_scope) : undefined,
    })),
    reading_attempts: rawReadingAttempts.map((a: any) => ({
      created_at: String(a.created_at ?? ''),
      reading_slug: String(a.reading_slug ?? ''),
      score: Number(a.score || 0),
      total: Number(a.total || 0),
    })),
    mistakes_count: typeof payload.mistakes_count === 'number' ? payload.mistakes_count : Number(payload.mistakes_count || 0),
    syllabus_words_count: typeof payload.syllabus_words_count === 'number'
      ? payload.syllabus_words_count
      : 0,
    units: rawUnits.map((u: any) => ({
      code: String(u.code ?? ''),
      title: String(u.title ?? ''),
      hsk_level: Number(u.hsk_level || 0),
      total_words: Number(u.total_words || 0),
      settled_words: Number(u.settled_words || 0),
      total_items: Number(u.total_items ?? u.total_words ?? 0),
      settled_items: Number(u.settled_items ?? u.settled_words ?? 0),
      completed: Boolean(u.completed),
    })),
  };
}
