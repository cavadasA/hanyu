import { getSupabaseClient } from '../supabaseClient';
import { getSettings } from './settings';
import {
  callRpcVariants,
  createRepositoryError,
  getRequiredUserId,
} from './shared';

function mapCardRow(row) {
  const word = Array.isArray(row.words) ? row.words[0] : row.words;

  return {
    id: row.id,
    user_id: row.user_id,
    word_id: row.word_id,
    ease_factor: row.ease_factor,
    interval: row.interval_days,
    interval_days: row.interval_days,
    repetitions: row.repetitions,
    next_review: row.next_review_at,
    next_review_at: row.next_review_at,
    last_review: row.last_reviewed_at,
    last_reviewed_at: row.last_reviewed_at,
    status: row.status,
    hanzi: word?.hanzi,
    pinyin: word?.pinyin,
    meaning_en: word?.meaning_en,
    meaning_es: word?.meaning_es,
    hsk_level: word?.hsk_level,
    pos: word?.pos,
    frequency: word?.frequency,
  };
}

function normalizeReviewResult(payload, cardId) {
  const result = Array.isArray(payload) ? payload[0] : payload;
  const nextReviewRaw =
    result?.next_review ||
    result?.next_review_at ||
    result?.next_review_date ||
    null;

  return {
    card_id: result?.card_id || cardId,
    interval: result?.interval || result?.interval_days || 0,
    next_review: typeof nextReviewRaw === 'string' ? nextReviewRaw.split('T')[0] : nextReviewRaw,
    ease_factor: result?.ease_factor || result?.new_ease_factor || null,
    status: result?.status || null,
  };
}

export async function getDueCards(limit = 50, client = getSupabaseClient()) {
  const userId = await getRequiredUserId(client);
  const settings = await getSettings(client);
  const maxFromSettings = settings.max_reviews_per_session || 100;
  const requestedLimit = Math.max(1, parseInt(limit, 10) || maxFromSettings);
  const effectiveLimit = Math.min(maxFromSettings, requestedLimit);
  const nowIso = new Date().toISOString();

  let query = client
    .from('srs_cards')
    .select(
      'id, user_id, word_id, ease_factor, interval_days, repetitions, next_review_at, last_reviewed_at, status, words:word_id(id, hanzi, pinyin, meaning_en, meaning_es, hsk_level, pos, frequency)'
    )
    .eq('user_id', userId)
    .lte('next_review_at', nowIso)
    .order('next_review_at', { ascending: true })
    .limit(effectiveLimit);

  const [{ data, error }, deckCountResult] = await Promise.all([
    query,
    client
      .from('srs_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  if (error) {
    throw createRepositoryError(error, 'Failed to load due cards');
  }

  if (deckCountResult.error) {
    throw createRepositoryError(deckCountResult.error, 'Failed to load deck size');
  }

  let cards = (data || []).map(mapCardRow);
  if (settings.card_order === 'frequency') {
    cards = cards
      .slice()
      .sort((a, b) => {
        const freqA = Number.isFinite(Number(a.frequency)) ? Number(a.frequency) : Number.MAX_SAFE_INTEGER;
        const freqB = Number.isFinite(Number(b.frequency)) ? Number(b.frequency) : Number.MAX_SAFE_INTEGER;

        if (freqA !== freqB) {
          return freqA - freqB;
        }

        const dateA = a.next_review_at ? new Date(a.next_review_at).getTime() : 0;
        const dateB = b.next_review_at ? new Date(b.next_review_at).getTime() : 0;
        return dateA - dateB;
      });
  }

  return {
    cards,
    total: cards.length,
    deck_size: deckCountResult.count || 0,
  };
}

export async function reviewCard(id, quality, timeMs, client = getSupabaseClient()) {
  const result = await callRpcVariants(client, 'review_flashcard', [
    { card_id: id, quality, time_ms: timeMs || null },
    { p_card_id: id, p_quality: quality, p_time_ms: timeMs || null },
  ]);

  return normalizeReviewResult(result, id);
}

export async function addCard(wordId, client = getSupabaseClient()) {
  const userId = await getRequiredUserId(client);

  const { data: word, error: wordError } = await client
    .from('words')
    .select('id')
    .eq('id', wordId)
    .maybeSingle();

  if (wordError) {
    throw createRepositoryError(wordError, 'Failed to validate word');
  }

  if (!word) {
    const notFound = new Error('Word not found');
    notFound.status = 404;
    throw notFound;
  }

  const { data: existing, error: existingError } = await client
    .from('srs_cards')
    .select('id')
    .eq('user_id', userId)
    .eq('word_id', wordId)
    .maybeSingle();

  if (existingError) {
    throw createRepositoryError(existingError, 'Failed to validate existing card');
  }

  if (existing) {
    const duplicate = new Error('Word already in deck');
    duplicate.status = 409;
    throw duplicate;
  }

  const { data, error } = await client
    .from('srs_cards')
    .insert({
      user_id: userId,
      word_id: wordId,
      next_review_at: new Date().toISOString(),
      status: 'new',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const duplicate = new Error('Word already in deck');
      duplicate.status = 409;
      throw duplicate;
    }

    throw createRepositoryError(error, 'Failed to add card');
  }

  return { card_id: data.id };
}

export async function createStarterDeck(input = {}, client = getSupabaseClient()) {
  const strategy = input.strategy || 'hsk2_consolidation';
  const limit = input.limit === undefined ? null : parseInt(input.limit, 10);

  const result = await callRpcVariants(client, 'create_starter_deck', [
    { strategy, limit },
    { p_strategy: strategy, p_limit: limit },
  ]);

  const payload = Array.isArray(result) ? result[0] : result;
  return {
    inserted: payload?.inserted || 0,
    total_deck_size: payload?.total_deck_size || payload?.deck_size || 0,
  };
}

export async function getFlashcardStats(client = getSupabaseClient()) {
  const userId = await getRequiredUserId(client);
  const nowIso = new Date().toISOString();

  const [totalResult, dueResult, statusResult, levelResult] = await Promise.all([
    client.from('srs_cards').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    client
      .from('srs_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('next_review_at', nowIso),
    client.from('srs_cards').select('status').eq('user_id', userId),
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

  const byStatus = {};
  for (const row of statusResult.data || []) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }

  const byLevel = {};
  for (const row of levelResult.data || []) {
    const relation = Array.isArray(row.words) ? row.words[0] : row.words;
    const level = relation?.hsk_level;
    if (level !== undefined && level !== null) {
      byLevel[level] = (byLevel[level] || 0) + 1;
    }
  }

  return {
    total: totalResult.count || 0,
    due: dueResult.count || 0,
    by_status: byStatus,
    by_level: byLevel,
  };
}