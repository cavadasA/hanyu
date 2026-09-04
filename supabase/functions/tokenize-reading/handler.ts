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
  const readingId = String(body?.reading_id || '').trim();
  if (!readingId) {
    return jsonResponse({ error: 'reading_id is required' }, 400);
  }

  const { data: reading, error: readingError } = await supabase
    .from('reading')
    .select('sentences')
    .eq('slug', readingId)
    .single();
  if (readingError || !reading) {
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

  return jsonResponse({
    tokens: tokenizeReading(
      (Array.isArray(reading.sentences) ? reading.sentences : [])
        .map((sentence: any) => String(sentence?.zh ?? ''))
        .join(''),
      dictionary,
    ),
  });
}
