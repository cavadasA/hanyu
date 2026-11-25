import { jsonResponse } from '../_shared/cors.ts';
import {
  tokenizeReading,
  type DictionaryEntry,
  type ReadingToken,
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

interface StoredSentence {
  zh?: unknown;
  /** Acepciones resueltas y validadas en la build (scripts/build-readings.js). */
  senses?: Array<{ hanzi: string; occurrence: number; hsk_level: number; sense_index: number | null }>;
}

function readingSentences(value: unknown): StoredSentence[] {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  return Array.isArray(value) ? value : [];
}

/**
 * El tokenizador no sabe qué acepción usa la frase; la lectura sí, porque se
 * anotó y validó al escribirla. Cada aparición anotada pasa a tener como
 * `word` esa acepción, y las demás siguen disponibles en `senses`.
 */
function applyResolvedSenses(tokens: ReadingToken[], sentences: StoredSentence[], slug: string) {
  const ends: number[] = [];
  let length = 0;
  for (const sentence of sentences) {
    length += String(sentence?.zh ?? '').length;
    ends.push(length);
  }

  const seen = new Map<string, number>();
  let sentenceIndex = 0;
  for (const token of tokens) {
    const offset = Number(token.id.slice(1));
    while (sentenceIndex < ends.length - 1 && offset >= ends[sentenceIndex]) {
      sentenceIndex += 1;
      seen.clear();
    }
    if (token.type !== 'word') continue;

    const occurrence = seen.get(token.text) ?? 0;
    seen.set(token.text, occurrence + 1);

    const resolved = sentences[sentenceIndex]?.senses?.find(
      sense => sense.hanzi === token.text && sense.occurrence === occurrence,
    );
    if (!resolved) continue;

    const word = (token.senses ?? [token.word]).find(
      sense => sense?.hsk_level === resolved.hsk_level && (sense?.sense_index ?? null) === (resolved.sense_index ?? null),
    );
    if (!word) {
      // La build garantiza que la acepción existe; si no está, la tabla words
      // no es la que validó la build. Se registra y el token queda como lo dejó el tokenizador.
      console.error('Resolved sense missing from words:', { slug, sentence: sentenceIndex, ...resolved });
      continue;
    }
    token.word = word;
  }
  return tokens;
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
    if (result.error) {
      console.error('Failed to load reading:', result.error);
    }
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
    console.error('Failed to prepare reading words:', { wordsError, cardsError });
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

  const tokensByReading = Object.fromEntries(readings.map((reading: any) => {
    const slug = String(reading.slug ?? readingIds[0]);
    const sentences = readingSentences(reading.sentences);
    const tokens = tokenizeReading(
      sentences.map(sentence => String(sentence?.zh ?? '')).join(''),
      dictionary,
    );
    return [slug, applyResolvedSenses(tokens, sentences, slug)];
  }));

  return jsonResponse(
    readingIds.length === 1
      ? { tokens: tokensByReading[readingIds[0]] }
      : { tokens_by_reading: tokensByReading },
  );
}
