import { jsonResponse } from '../_shared/cors.ts';
import {
  tokenizeReading,
  type DictionaryEntry,
} from '../_shared/reading-tokenizer.ts';

interface TokenizerClient {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  from(table: string): any;
}

function readingSentences(value: unknown): Array<{ zh?: unknown }> {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  return Array.isArray(value) ? value : [];
}

export async function handleTokenizeReading(
  request: Request,
  supabase: TokenizerClient,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok');
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return jsonResponse({ error: 'Missing bearer token' }, 401);
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const readingIds = Array.isArray(body?.reading_ids)
    ? [...new Set(body.reading_ids.map((id: unknown) => String(id).trim()).filter(Boolean))]
    : [String(body?.reading_id || '').trim()].filter(Boolean);
  if (readingIds.length === 0) {
    return jsonResponse({ error: 'reading_id is required' }, 400);
  }

  let readingQuery = supabase.from('reading').select('slug, sentences');
  const result = readingIds.length === 1
    ? await readingQuery.eq('slug', readingIds[0]).single()
    : await readingQuery.in('slug', readingIds);
  const readings = readingIds.length === 1
    ? (result.data ? [result.data] : [])
    : (Array.isArray(result.data) ? result.data : []);
  if (result.error || readings.length !== readingIds.length) {
    return jsonResponse({ error: 'Reading not found' }, 404);
  }

  const [{ data: words, error: wordsError }, { data: cards, error: cardsError }] =
    await Promise.all([
      supabase
        .from('words')
        .select('id, hanzi, sense_index, variants, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency')
        .in('hsk_level', [1, 2, 3]),
      supabase
        .from('srs_cards')
        .select('word_id')
        .eq('user_id', user.id),
    ]);

  if (wordsError || cardsError) {
    return jsonResponse({ error: 'Failed to prepare reading words' }, 500);
  }

  const cardWordIds = new Set((cards || []).map((card: any) => Number(card.word_id)));
  const dictionary: DictionaryEntry[] = (words || []).map((word: any) => ({
    id: Number(word.id),
    hanzi: String(word.hanzi),
    sense_index: word.sense_index ?? null,
    variants: Array.isArray(word.variants) ? word.variants.map(String) : [],
    traditional: word.traditional ?? null,
    pinyin: String(word.pinyin),
    meaning_en: String(word.meaning_en),
    meaning_es: word.meaning_es ? String(word.meaning_es) : null,
    classifier: word.classifier ?? null,
    hsk_level: Number(word.hsk_level),
    pos: word.pos ? String(word.pos) : null,
    frequency: word.frequency === null ? null : Number(word.frequency),
    in_srs: cardWordIds.has(Number(word.id)),
  }));

  const tokensByReading = Object.fromEntries(readings.map((reading: any) => [
    String(reading.slug ?? readingIds[0]),
    tokenizeReading(
      readingSentences(reading.sentences)
        .map(sentence => String(sentence?.zh ?? ''))
        .join(''),
      dictionary,
    ),
  ]));

  return jsonResponse(
    readingIds.length === 1
      ? { tokens: tokensByReading[readingIds[0]] }
      : { tokens_by_reading: tokensByReading },
  );
}
