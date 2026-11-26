import { coverageOf, type Coverage, type CoverageToken } from '@hanyu/domain';
import type { HanyuClient } from '../client';
import type {
  HskLevel,
  GrammarPoint,
  ReadingDetail,
  ReadingFormat,
  ReadingGrammarTarget,
  MarkReadOptions,
  ReadingProgress,
  ReadingResult,
  ReadingSentence,
  ReadingSummary,
} from '../types';
import {
  createRepositoryError,
  getRequiredUserId,
  parseJsonField,
  toDateString,
} from './shared';

const VALID_FORMATS = new Set(['short_text', 'story', 'dialogue']);
const KNOWN_MIN_STABILITY_DAYS = 30;
const READING_SELECT =
  'slug, hsk_level, format, title, topic, series, series_index, sentences, questions, target_words, target_grammar, audio_kind, sentence_audio';
const READING_PROGRESS_SELECT = 'reading_slug, bookmarked, last_sentence, started_at, finished_at, pinyin_shown, updated_at';

function normalizeQuestions(questions: unknown) {
  return (Array.isArray(questions) ? questions : []).map((question: any, index: number) => ({
    id: String(question.id ?? `q${index}`),
    prompt: String(question.prompt ?? question.question ?? ''),
    options: (Array.isArray(question.options) ? question.options : []).map((option: any, optionIndex: number) =>
      typeof option === 'string'
        ? { id: String(optionIndex), text: option }
        : { id: String(option.id ?? optionIndex), text: String(option.text ?? '') },
    ),
  }));
}

function normalizeGrammarTargets(value: unknown): ReadingGrammarTarget[] {
  const targets = parseJsonField(value, []);

  return (Array.isArray(targets) ? targets : []).flatMap((target: any) => {
    const code = typeof target?.code === 'string' ? target.code : '';
    const level = Number(target?.level);

    return code && Number.isInteger(level) ? [{ code, level }] : [];
  });
}

function normalizeGrammarPoint(point: any): GrammarPoint {
  return {
    id: Number(point.id),
    hsk_level: Number(point.hsk_level) as HskLevel,
    code: String(point.code),
    group: point.group ?? null,
    category: point.category ?? null,
    detail: point.detail ?? null,
    title: String(point.title ?? ''),
    pattern: point.pattern ?? null,
    explanation: point.explanation ?? null,
    items: parseJsonField(point.items, []),
    examples: parseJsonField(point.examples, []),
    markers: point.markers ?? [],
    common_errors: parseJsonField(point.common_errors, []),
    see_also: parseJsonField(point.see_also, []),
    ...(point.order_idx === undefined ? {} : { order_idx: point.order_idx }),
  };
}

async function getReadingGrammarPoints(
  targets: ReadingGrammarTarget[],
  client: HanyuClient,
): Promise<GrammarPoint[]> {
  if (targets.length === 0) {
    return [];
  }

  const codes = [...new Set(targets.map(target => target.code))];
  const { data, error } = await client
    .from('grammar_points')
    .select('id, hsk_level, code, "group", category, detail, title, pattern, explanation, items, examples, order_idx')
    .in('code', codes);

  if (error) {
    throw createRepositoryError(error, 'No se pudo cargar la gramática de la lectura');
  }

  const targetKeys = new Set(targets.map(target => `${target.code}:${target.level}`));
  return (data ?? [])
    .map(normalizeGrammarPoint)
    .filter(point => targetKeys.has(`${point.code}:${point.hsk_level}`));
}

async function getReadingGrammarPointMap(
  summaries: ReadingSummary[],
  client: HanyuClient,
): Promise<Map<string, GrammarPoint[]>> {
  const pointsByReading = new Map<string, GrammarPoint[]>();
  const targets = summaries.flatMap(summary => summary.target_grammar);
  const codes = [...new Set(targets.map(target => target.code))];
  if (codes.length === 0) return pointsByReading;

  const { data, error } = await client
    .from('grammar_points')
    .select('id, hsk_level, code, "group", category, detail, title, pattern, explanation, items, examples, order_idx')
    .in('code', codes);
  if (error) {
    throw createRepositoryError(error, 'No se pudo cargar la gramática de la lectura');
  }

  const normalized = (data ?? []).map(normalizeGrammarPoint);
  for (const summary of summaries) {
    const targetKeys = new Set(summary.target_grammar.map(target => `${target.code}:${target.level}`));
    pointsByReading.set(
      summary.slug,
      normalized.filter(point => targetKeys.has(`${point.code}:${point.hsk_level}`)),
    );
  }

  return pointsByReading;
}

function normalizeQuestionId(question: any, index: number) {
  return question.id || `q${index}`;
}

function tokensBySentence(sentences: ReadingSentence[], tokens: ReadingDetail['tokens']) {
  let sentenceStart = 0;

  return sentences.map((sentence) => {
    const sentenceEnd = sentenceStart + sentence.zh.length;
    const sentenceTokens = tokens.filter((token) => {
      const offset = Number(String(token.id).replace(/^t/, ''));
      return Number.isInteger(offset) && offset >= sentenceStart && offset < sentenceEnd;
    });
    sentenceStart = sentenceEnd;

    return { ...sentence, tokens: sentenceTokens };
  });
}

async function getRecognitionStates(wordIds: number[], client: HanyuClient) {
  const states = new Map<number, number | null>();
  if (wordIds.length === 0) return states;

  let query: any;
  try {
    query = client
      .from('learner_skill_state')
      .select('target_id, stability')
      .eq('target_kind', 'word')
      .eq('skill', 'recognition');
  } catch {
    return states;
  }

  if (typeof query.in !== 'function') return states;
  const { data, error } = await query.in('target_id', wordIds);
  if (error) {
    throw createRepositoryError(error, 'No se pudo cargar tu avance con las palabras');
  }

  for (const state of data ?? []) {
    states.set(Number(state.target_id), state.stability === null ? null : Number(state.stability));
  }
  return states;
}

async function tokenizeReadings(
  summaries: ReadingSummary[],
  client: HanyuClient,
): Promise<Map<string, ReadingDetail['tokens']> | null> {
  if (summaries.length === 0) return new Map();
  const functions = (client as any).functions;
  if (!functions || typeof functions.invoke !== 'function') {
    return null;
  }

  const { data, error } = await functions.invoke('tokenize-reading', {
    body: { reading_ids: summaries.map(summary => summary.slug) },
  });
  if (error) {
    return null;
  }

  const tokensByReading = new Map<string, any[]>();
  if (data?.tokens_by_reading && typeof data.tokens_by_reading === 'object') {
    for (const summary of summaries) {
      const tokens = data.tokens_by_reading[summary.slug];
      tokensByReading.set(summary.slug, Array.isArray(tokens) ? tokens : []);
    }
  } else if (summaries.length === 1 && Array.isArray(data?.tokens)) {
    tokensByReading.set(summaries[0].slug, data.tokens);
  } else {
    return null;
  }

  const ids = [...new Set(
    [...tokensByReading.values()]
      .flat()
      .map((token: any) => token.word?.id)
      .filter((id: unknown): id is number => typeof id === 'number'),
  )];
  const states = await getRecognitionStates(ids, client);
  return new Map(summaries.map(summary => [
    summary.slug,
    statusTokens(tokensByReading.get(summary.slug) ?? [], summary.target_words, states),
  ]));
}

async function getReadingProgressMap(
  summaries: ReadingSummary[],
  client: HanyuClient,
): Promise<Map<string, ReadingProgress>> {
  const progress = new Map<string, ReadingProgress>();
  if (summaries.length === 0 || !(client as any).auth?.getUser) {
    return progress;
  }

  const userId = await getRequiredUserId(client);
  let query: any = (client.from as any)('reading_progress').select(READING_PROGRESS_SELECT).eq('user_id', userId);
  if (typeof query.in !== 'function') return progress;

  const { data, error } = await query.in('reading_slug', summaries.map(summary => summary.slug));
  if (error) {
    throw createRepositoryError(error, 'No se pudo cargar tu avance en la lectura');
  }

  for (const row of data ?? []) {
    if (row?.reading_slug) {
      progress.set(String(row.reading_slug), normalizeProgress(String(row.reading_slug), row));
    }
  }
  return progress;
}

function statusTokens(
  tokens: ReadingDetail['tokens'],
  targetWords: string[],
  recognitionStates: Map<number, number | null>,
) {
  const targets = new Set(targetWords);

  return tokens.map(token => {
    if (token.type === 'punctuation' || !token.word) {
      return { ...token, status: token.type === 'punctuation' ? undefined : 'unknown' as const };
    }

    if (targets.has(token.word.hanzi)) {
      return { ...token, status: 'target' as const };
    }

    const stability = recognitionStates.get(token.word.id);
    if (stability !== undefined && stability !== null && stability >= KNOWN_MIN_STABILITY_DAYS) {
      return { ...token, status: 'known' as const };
    }

    return { ...token, status: token.word.in_srs ? 'learning' as const : 'unknown' as const };
  });
}

function extractCorrectOptionId(question: any) {
  if (question.correct_option_id !== undefined) {
    return question.correct_option_id;
  }

  if (question.correct !== undefined) {
    return question.correct;
  }

  if (question.answer_index !== undefined && Array.isArray(question.options)) {
    return String(question.answer_index);
  }

  if (Array.isArray(question.options)) {
    const markedOption = question.options.find((option: any) => option?.correct === true);
    if (markedOption && markedOption.id !== undefined) {
      return markedOption.id;
    }
  }

  return null;
}

function scoreLocally(questions: any, answers: any) {
  let score = 0;
  let inferentialScore = 0;
  let inferentialTotal = 0;
  const normalizedAnswers = answers || {};
  const results: ReadingResult['results'] = [];

  (questions || []).forEach((question: any, index: number) => {
    const questionId = normalizeQuestionId(question, index);
    const correctOptionId = extractCorrectOptionId(question);
    const selectedOptionId = normalizedAnswers[questionId];
    const correct = selectedOptionId !== undefined && selectedOptionId === correctOptionId;

    // Las preguntas anteriores al Plan 14 no llevan kind: todas eran literales.
    const kind = question.kind === 'inferential' ? 'inferential' as const : 'literal' as const;

    if (correct) {
      score += 1;
    }
    if (kind === 'inferential') {
      inferentialTotal += 1;
      if (correct) inferentialScore += 1;
    }

    results.push({
      question_id: questionId,
      selected_option_id: selectedOptionId,
      correct_option_id: correctOptionId,
      correct,
      kind,
      ...(kind === 'inferential' && typeof question.rationale_es === 'string'
        ? { rationale_es: question.rationale_es }
        : {}),
    });
  });

  return {
    score,
    total: Array.isArray(questions) ? questions.length : 0,
    results,
    inferential_score: inferentialScore,
    inferential_total: inferentialTotal,
  };
}

async function incrementReadingStat(client: HanyuClient, userId: string) {
  const today = toDateString();
  const { data: existing, error: existingError } = await client
    .from('user_stats')
    .select('id, readings_done')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (existingError) {
    throw createRepositoryError(existingError, 'No se pudieron cargar las estadísticas de lectura');
  }

  if (existing) {
    const { error } = await client
      .from('user_stats')
      .update({ readings_done: Number(existing.readings_done || 0) + 1 } as any)
      .eq('id', existing.id);

    if (error) {
      throw createRepositoryError(error, 'No se pudieron guardar las estadísticas de lectura');
    }

    return;
  }

  const { error } = await client.from('user_stats').insert({
    user_id: userId,
    date: today,
    readings_done: 1,
  } as any);

  if (error) {
    throw createRepositoryError(error, 'No se pudieron guardar las estadísticas de lectura');
  }
}

//
// Lo que el planificador del Plan 5B necesita para decidir si hoy toca leer, y
// cuál. Vive aquí y no en `today` porque las tres definiciones que usa —el
// vocabulario de una lectura, qué cuenta como palabra conocida, y qué lectura
// se dio por terminada— ya viven aquí y tienen que seguir significando lo
// mismo: la etiqueta que el usuario lee en la lista sale de estas mismas
// funciones. Duplicarlas dejaría que la cifra mostrada y la decisión tomada
// divergieran sobre la misma lectura.
const RECENT_READING_WINDOW_DAYS = 30;

export interface ReadingPlannerInput {
  /** Las filas del catálogo, en el orden del catálogo. */
  rows: any[];
  /** Lo que `rankContent` puntúa. Vacío si no se pudo tokenizar. */
  rankable: Array<{ id: string; topic: string | null; word_ids: number[] }>;
  known_word_ids: number[];
  recent_content_ids: string[];
  covered_topics: string[];
  finished_slugs: string[];
}

const EMPTY_PLANNER_INPUT: ReadingPlannerInput = {
  rows: [],
  rankable: [],
  known_word_ids: [],
  recent_content_ids: [],
  covered_topics: [],
  finished_slugs: [],
};

/** Las lecturas terminadas y sus temas, para no volver a proponer lo hecho. */
async function getFinishedReadings(userId: string, client: HanyuClient): Promise<string[]> {
  const query: any = (client.from as any)('reading_progress');
  if (!query || typeof query.select !== 'function') return [];

  const scoped = query.select('reading_slug, finished_at');
  if (!scoped || typeof scoped.eq !== 'function') return [];

  const { data, error } = await scoped.eq('user_id', userId);
  if (error) {
    throw createRepositoryError(error, 'No se pudo cargar tu avance en la lectura');
  }

  return (data ?? [])
    .filter((row: any) => Boolean(row?.finished_at))
    .map((row: any) => String(row.reading_slug));
}

/**
 * Las lecturas terminadas hace poco, leídas del `learning_event` que escribe
 * `markRead`. Es la única lectura de ese evento en todo el sistema: sin esto
 * `seen_recently` no tendría de dónde salir y el evento sería de solo escritura.
 */
async function getRecentlyCompletedReadings(userId: string, client: HanyuClient): Promise<string[]> {
  const query: any = (client.from as any)('learning_event');
  if (!query || typeof query.select !== 'function') return [];

  const scoped = query.select('payload, occurred_at');
  if (!scoped || typeof scoped.eq !== 'function') return [];

  let filtered = scoped.eq('user_id', userId);
  if (typeof filtered.eq !== 'function') return [];
  filtered = filtered.eq('kind', 'reading_completed');

  if (typeof filtered.gte === 'function') {
    const since = new Date(Date.now() - RECENT_READING_WINDOW_DAYS * 86400000);
    filtered = filtered.gte('occurred_at', since.toISOString());
  }

  const { data, error } = await filtered;
  if (error) {
    throw createRepositoryError(error, 'No se pudieron cargar las lecturas terminadas');
  }

  const slugs: string[] = [];
  for (const row of data ?? []) {
    const slug = (row as any)?.payload?.reading_slug;
    if (typeof slug === 'string' && slug && !slugs.includes(slug)) {
      slugs.push(slug);
    }
  }
  return slugs;
}

export async function getReadingPlannerInput(
  level: HskLevel,
  userId: string,
  client: HanyuClient,
): Promise<ReadingPlannerInput> {
  const query: any = client
    .from('reading')
    .select(READING_SELECT)
    .eq('hsk_level', level)
    .order('series', { ascending: true, nullsFirst: false })
    .order('series_index', { ascending: true, nullsFirst: false })
    .order('slug');

  const { data, error } = await query;
  if (error) {
    throw createRepositoryError(error, 'No se pudo cargar la siguiente lectura');
  }

  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    return EMPTY_PLANNER_INPUT;
  }

  const summaries = rows.map(row => normalizeSummary(row, client));
  const [tokenized, finished, recent] = await Promise.all([
    tokenizeReadings(summaries, client),
    getFinishedReadings(userId, client),
    getRecentlyCompletedReadings(userId, client),
  ]);

  const known = new Set<number>();
  const rankable: ReadingPlannerInput['rankable'] = [];

  for (const summary of summaries) {
    const tokens = tokenized?.get(summary.slug);
    if (!tokens) continue;

    for (const id of knownFromTokens(tokens)) {
      known.add(id);
    }

    // Por forma distinta y no por aparición: `rankContent` divide sobre la
    // longitud de esta lista, así que repetir una palabra la haría pesar como
    // vocabulario nuevo que no es.
    rankable.push({
      id: summary.slug,
      topic: summary.topic || null,
      word_ids: [...new Set(
        tokens
          .filter(token => token.type !== 'punctuation' && token.word)
          .map(token => token.word!.id),
      )],
    });
  }

  const finishedSlugs = finished.filter(slug => rows.some(row => String(row.slug) === slug));
  const topicBySlug = new Map(rows.map(row => [String(row.slug), String(row.topic ?? '')]));
  const coveredTopics: string[] = [];
  for (const slug of finishedSlugs) {
    const topic = topicBySlug.get(slug);
    if (topic && !coveredTopics.includes(topic)) {
      coveredTopics.push(topic);
    }
  }

  return {
    rows,
    rankable,
    known_word_ids: [...known],
    recent_content_ids: recent,
    covered_topics: coveredTopics,
    finished_slugs: finishedSlugs,
  };
}

export async function getReadings(
  params: { level?: HskLevel; topic?: string; format?: ReadingFormat } = {},
  client: HanyuClient,
): Promise<ReadingSummary[]> {
  let query = client
    .from('reading')
    .select(READING_SELECT)
    .order('hsk_level')
    .order('series', { ascending: true, nullsFirst: false })
    .order('series_index', { ascending: true, nullsFirst: false })
    .order('slug');

  if (params.level) {
    query = query.eq('hsk_level', params.level);
  }

  if (params.topic) {
    query = query.eq('topic', params.topic);
  }

  if (params.format && VALID_FORMATS.has(params.format)) {
    query = query.eq('format', params.format);
  }

  const { data, error } = await query;
  if (error) {
    throw createRepositoryError(error, 'No se pudieron cargar las lecturas');
  }

  const summaries = (data || []).map(row => normalizeSummary(row, client));
  const tokenized = await tokenizeReadings(summaries, client);
  const grammarPoints = await getReadingGrammarPointMap(summaries, client);
  const withCoverage = summaries.map(summary => {
    const tokens = tokenized?.get(summary.slug) ?? [];
    const coverageTokens: CoverageToken[] = tokens.map(token => ({
      word_id: token.word?.id ?? null,
      type: token.type,
      form: token.text,
    }));

    return {
      ...summary,
      coverage: tokenized?.has(summary.slug) ? coverageOf(coverageTokens, knownFromTokens(tokens)) : null,
      offline: summary.offline ? {
        ...summary.offline,
        content: summary.offline.sentences.map(sentence => sentence.zh).join(''),
        grammar_points: grammarPoints.get(summary.slug) ?? [],
        sentences: tokensBySentence(summary.offline.sentences, tokens),
        tokens,
      } : undefined,
    };
  });
  const progress = await getReadingProgressMap(summaries, client);
  return withCoverage.map(summary => ({
    ...summary,
    progress: progress.get(summary.slug) ?? null,
  }));
}

function knownFromTokens(tokens: ReadingDetail['tokens']) {
  return new Set(tokens
    .filter(token => token.status === 'known' && token.word)
    .map(token => token.word!.id));
}

function normalizeSentences(value: unknown): ReadingSentence[] {
  const sentences = parseJsonField(value, []);
  return (Array.isArray(sentences) ? sentences : []).map((sentence: any) => ({
    zh: String(sentence?.zh ?? ''),
    pinyin: String(sentence?.pinyin ?? ''),
    es: String(sentence?.es ?? ''),
    tokens: [],
  }));
}

const AUDIO_KINDS = new Set(['tts', 'neural', 'human']);

/** `path` es '<bucket>/<objeto>' (media-index.json); la URL la da Storage. */
function normalizeSentenceAudio(value: unknown, client: HanyuClient): ReadingSummary['sentence_audio'] {
  const entries = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(entries)) return [];
  return entries.map(entry => {
    if (!entry || typeof entry.path !== 'string') return null;
    const [bucket, ...object] = entry.path.split('/');
    return {
      url: client.storage.from(bucket).getPublicUrl(object.join('/')).data.publicUrl,
      duration_ms: Number(entry.duration_ms),
    };
  });
}

function normalizeSummary(row: any, client: HanyuClient): ReadingSummary {
  const slug = String(row.slug);
  const sentences = normalizeSentences(row.sentences);

  return {
    id: slug,
    slug,
    hsk_level: Number(row.hsk_level) as HskLevel,
    format: row.format as ReadingFormat,
    title: String(row.title),
    topic: String(row.topic ?? ''),
    series: row.series === null || row.series === undefined ? null : String(row.series),
    series_index: row.series_index === null || row.series_index === undefined
      ? null
      : Number(row.series_index),
    target_words: Array.isArray(row.target_words) ? row.target_words.map(String) : [],
    target_grammar: normalizeGrammarTargets(row.target_grammar),
    audio_kind: AUDIO_KINDS.has(row.audio_kind) ? row.audio_kind : 'tts',
    sentence_audio: normalizeSentenceAudio(row.sentence_audio, client),
    offline: {
      sentences,
      content: sentences.map(sentence => sentence.zh).join(''),
      grammar_points: [],
      questions: normalizeQuestions(row.questions),
      tokens: [],
    },
    ...(row.created_at ? { created_at: String(row.created_at) } : {}),
  };
}

function normalizeProgress(slug: string, row: any): ReadingProgress {
  return {
    reading_slug: String(row?.reading_slug ?? slug),
    bookmarked: Boolean(row?.bookmarked),
    last_sentence: Math.max(0, Number(row?.last_sentence ?? 0)),
    started_at: row?.started_at ? String(row.started_at) : null,
    finished_at: row?.finished_at ? String(row.finished_at) : null,
    pinyin_shown: typeof row?.pinyin_shown === 'boolean' ? row.pinyin_shown : null,
    updated_at: String(row?.updated_at ?? new Date().toISOString()),
  };
}

async function loadProgress(slug: string, userId: string, client: HanyuClient) {
  const { data, error } = await (client.from as any)('reading_progress')
    .select(READING_PROGRESS_SELECT)
    .eq('user_id', userId)
    .eq('reading_slug', slug)
    .maybeSingle();

  if (error) {
    throw createRepositoryError(error, 'No se pudo cargar tu avance en la lectura');
  }

  return normalizeProgress(slug, data);
}

async function saveProgress(
  slug: string,
  userId: string,
  progress: ReadingProgress,
  client: HanyuClient,
) {
  const { error } = await (client.from as any)('reading_progress').upsert(
    {
      user_id: userId,
      reading_slug: slug,
      bookmarked: progress.bookmarked,
      last_sentence: progress.last_sentence,
      started_at: progress.started_at ?? null,
      finished_at: progress.finished_at,
      pinyin_shown: progress.pinyin_shown ?? null,
      updated_at: progress.updated_at,
    },
    { onConflict: 'user_id,reading_slug' },
  );

  if (error) {
    throw createRepositoryError(error, 'No se pudo guardar tu avance en la lectura');
  }

  return progress;
}

export async function getReadingProgress(slug: string, client: HanyuClient): Promise<ReadingProgress> {
  const userId = await getRequiredUserId(client);
  return loadProgress(slug, userId, client);
}

export async function toggleBookmark(slug: string, client: HanyuClient): Promise<ReadingProgress> {
  const userId = await getRequiredUserId(client);
  const current = await loadProgress(slug, userId, client);
  return saveProgress(
    slug,
    userId,
    { ...current, bookmarked: !current.bookmarked, updated_at: new Date().toISOString() },
    client,
  );
}

export async function saveReadingProgress(
  slug: string,
  lastSentence: number,
  client: HanyuClient,
): Promise<ReadingProgress> {
  const userId = await getRequiredUserId(client);
  const current = await loadProgress(slug, userId, client);
  const updatedAt = new Date().toISOString();
  return saveProgress(
    slug,
    userId,
    {
      ...current,
      last_sentence: Math.max(0, Math.floor(lastSentence)),
      started_at: current.started_at ?? updatedAt,
      updated_at: updatedAt,
    },
    client,
  );
}

export type { MarkReadOptions };

export async function markRead(
  slug: string,
  clientOrOptions?: HanyuClient | MarkReadOptions,
  maybeClient?: HanyuClient,
): Promise<ReadingProgress> {
  const options: MarkReadOptions =
    clientOrOptions && typeof clientOrOptions === 'object' && 'from' in clientOrOptions
      ? {}
      : ((clientOrOptions as MarkReadOptions) ?? {});
  const client: HanyuClient =
    clientOrOptions && typeof clientOrOptions === 'object' && 'from' in clientOrOptions
      ? (clientOrOptions as HanyuClient)
      : maybeClient!;

  const userId = await getRequiredUserId(client);
  const current = await loadProgress(slug, userId, client);
  if (current.finished_at) {
    return current;
  }

  const reading = await loadReadingRow(slug, client);
  const finishedAt = new Date().toISOString();
  const progress = await saveProgress(
    slug,
    userId,
    {
      ...current,
      started_at: current.started_at ?? finishedAt,
      finished_at: finishedAt,
      pinyin_shown: typeof options.pinyinShown === 'boolean' ? options.pinyinShown : (current.pinyin_shown ?? null),
      updated_at: finishedAt,
    },
    client,
  );

  const { error } = await (client.from as any)('learning_event').insert({
    user_id: userId,
    kind: 'reading_completed',
    target_kind: null,
    target_id: null,
    skill: 'reading',
    payload: {
      reading_slug: slug,
      target_words: Array.isArray(reading.target_words) ? reading.target_words : [],
    },
  });

  if (error) {
    throw createRepositoryError(error, 'No se pudo guardar la lectura terminada');
  }

  return progress;
}

async function loadReadingRow(slug: string, client: HanyuClient) {
  const { data, error } = await client
    .from('reading')
    .select(READING_SELECT)
    .eq('slug', slug)
    .single();

  if (error) {
    throw createRepositoryError(error, 'No se pudo cargar la lectura');
  }

  return data as any;
}

export async function getReading(slug: string, client: HanyuClient): Promise<ReadingDetail> {
  const data = await loadReadingRow(slug, client);
  const { data: tokenData, error: tokenError } = await client.functions.invoke(
    'tokenize-reading',
    { body: { reading_id: slug } },
  );

  if (tokenError || !Array.isArray(tokenData?.tokens)) {
    const tokenMessage = String((tokenError as any)?.message ?? '');
    throw createRepositoryError(
      {
        status: (tokenError as any)?.status,
        code: (tokenError as any)?.code,
        message: /network|fetch failed|failed to fetch|timeout|timed out/i.test(tokenMessage)
          ? tokenMessage
          : 'Failed to prepare reading words',
      },
      'No se pudieron preparar las palabras de la lectura',
    );
  }

  const sentences = parseJsonField(data.sentences, []) as ReadingSentence[];
  const wordIds: number[] = tokenData.tokens
    .map((token: any) => token.word?.id)
    .filter((id: unknown): id is number => typeof id === 'number');
  const recognitionStates = await getRecognitionStates([...new Set(wordIds)], client);
  const tokens = statusTokens(tokenData.tokens, normalizeSummary(data, client).target_words, recognitionStates);
  const tokenizedSentences = tokensBySentence(sentences, tokens);
  const targetGrammar = normalizeGrammarTargets(data.target_grammar);
  const { offline: _offline, ...summary } = normalizeSummary(data, client);

  return {
    ...summary,
    sentences: tokenizedSentences,
    content: sentences.map(sentence => sentence.zh).join(''),
    grammar_points: await getReadingGrammarPoints(targetGrammar, client),
    questions: normalizeQuestions(parseJsonField(data.questions, [])),
    tokens,
  };
}

export async function completeReading(
  id: string,
  answers: Record<string, string>,
  client: HanyuClient,
): Promise<ReadingResult> {
  const reading = await loadReadingRow(id, client);
  const localResult = scoreLocally(parseJsonField(reading.questions, []), answers);
  const userId = await getRequiredUserId(client);

  const { error: attemptError } = await client.from('reading_attempts').insert({
    user_id: userId,
    reading_id: null,
    reading_slug: id,
    answers,
    score: localResult.score,
    total: localResult.total,
    inferential_score: localResult.inferential_score,
    inferential_total: localResult.inferential_total,
  } as any);

  if (!attemptError) {
    await incrementReadingStat(client, userId);
  }

  return { score: localResult.score, total: localResult.total, results: localResult.results };
}
