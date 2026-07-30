import type { HanyuClient } from '../client';
import type { Database } from '../database.types';
import type { ReviewEvent, ReviewSyncResult, VersionedCard } from '../types';
import { getSettings } from './settings';
import {
  callRpcVariants,
  createRepositoryError,
  getRequiredUserId,
} from './shared';

type SrsCardRow = Database['public']['Tables']['srs_cards']['Row'] & {
  words?: Database['public']['Tables']['words']['Row'] | Database['public']['Tables']['words']['Row'][] | null;
};

const CARD_SELECT =
  'id, user_id, word_id, ease_factor, interval_days, repetitions, next_review_at, last_reviewed_at, status, version, words:word_id(id, hanzi, pinyin, meaning_en, meaning_es, hsk_level, pos, frequency)';

function mapCardRow(row: SrsCardRow) {
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
    version: row.version,
    hanzi: word?.hanzi,
    pinyin: word?.pinyin,
    meaning_en: word?.meaning_en,
    meaning_es: word?.meaning_es,
    hsk_level: word?.hsk_level,
    pos: word?.pos,
    frequency: word?.frequency,
  };
}

function mapVersionedCardRow(row: SrsCardRow): VersionedCard {
  const mapped = mapCardRow(row);

  if (mapped.version === undefined || mapped.version === null) {
    throw createRepositoryError(new Error('Card version is missing'), 'Failed to load card');
  }

  return mapped as VersionedCard;
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

function normalizeReviewResult(payload: any, cardId: string) {
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

export async function getDueCards(limit: number = 50, client: HanyuClient) {
  const userId = await getRequiredUserId(client);
  const settings = await getSettings(client);
  const maxFromSettings = settings.max_reviews_per_session || 100;
  const requestedLimit = Math.max(1, parseInt(String(limit), 10) || maxFromSettings);
  const effectiveLimit = Math.min(maxFromSettings, requestedLimit);
  const nowIso = new Date().toISOString();

  let query = client
    .from('srs_cards')
    .select(CARD_SELECT)
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

  let cards = (data || []).map((row: any) => mapCardRow(row));
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

export async function getCard(id: string, client: HanyuClient): Promise<VersionedCard> {
  const userId = await getRequiredUserId(client);

  const { data, error } = await client
    .from('srs_cards')
    .select(CARD_SELECT)
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

  return mapVersionedCardRow(data as SrsCardRow);
}

export async function reviewCardEvent(event: ReviewEvent, client: HanyuClient): Promise<ReviewSyncResult> {
  const { data, error } = await client.rpc('review_flashcard', {
    card_id: event.card_id,
    quality: event.quality,
    time_ms: event.time_ms,
    review_id: event.review_id,
    reviewed_at: event.reviewed_at,
    expected_version: event.expected_version,
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to sync review');
  }

  const outcome = normalizeReviewSyncOutcome(data);
  const card = await getCard(event.card_id, client);

  return { outcome, card };
}

export async function reviewCard(id: string, quality: number, timeMs: number | null, client: HanyuClient) {
  const result = await callRpcVariants(client, 'review_flashcard', [
    { card_id: id, quality, time_ms: timeMs || null },
    { p_card_id: id, p_quality: quality, p_time_ms: timeMs || null },
  ]);

  return normalizeReviewResult(result, id);
}

export async function addCard(wordId: number | string, client: HanyuClient) {
  const userId = await getRequiredUserId(client);

  const { data: word, error: wordError } = await client
    .from('words')
    .select('id')
    .eq('id', wordId as any)
    .maybeSingle();

  if (wordError) {
    throw createRepositoryError(wordError, 'Failed to validate word');
  }

  if (!word) {
    const notFound = new Error('Word not found') as Error & { status?: number };
    notFound.status = 404;
    throw notFound;
  }

  const { data: existing, error: existingError } = await client
    .from('srs_cards')
    .select('id')
    .eq('user_id', userId)
    .eq('word_id', wordId as any)
    .maybeSingle();

  if (existingError) {
    throw createRepositoryError(existingError, 'Failed to validate existing card');
  }

  if (existing) {
    const duplicate = new Error('Word already in deck') as Error & { status?: number };
    duplicate.status = 409;
    throw duplicate;
  }

  const { data, error } = await client
    .from('srs_cards')
    .insert({
      user_id: userId,
      word_id: wordId as any,
      next_review_at: new Date().toISOString(),
      status: 'new',
    } as any)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const duplicate = new Error('Word already in deck') as Error & { status?: number };
      duplicate.status = 409;
      throw duplicate;
    }

    throw createRepositoryError(error, 'Failed to add card');
  }

  return { card_id: (data as any).id };
}

export async function createStarterDeck(input: { strategy?: string; limit?: number } = {}, client: HanyuClient) {
  const strategy = input.strategy || 'hsk2_consolidation';
  const limit = input.limit === undefined ? null : parseInt(String(input.limit), 10);

  const result = await callRpcVariants(client, 'create_starter_deck', [
    { strategy, p_limit: limit },
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

  const byStatus: Record<string, number> = {};
  for (const row of (statusResult.data || []) as any[]) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
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
    due: dueResult.count || 0,
    by_status: byStatus,
    by_level: byLevel,
  };
}