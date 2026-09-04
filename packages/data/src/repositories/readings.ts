import { coverageOf, type CoverageToken } from '@hanyu/domain';
import type { HanyuClient } from '../client';
import type {
  HskLevel,
  GrammarPoint,
  ReadingDetail,
  ReadingFormat,
  ReadingGrammarTarget,
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
  'slug, hsk_level, format, title, topic, series, series_index, sentences, questions, target_words, target_grammar, audio_kind, audio_url';

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
    throw createRepositoryError(error, 'Failed to load reading grammar points');
  }

  const targetKeys = new Set(targets.map(target => `${target.code}:${target.level}`));
  return (data ?? [])
    .map(normalizeGrammarPoint)
    .filter(point => targetKeys.has(`${point.code}:${point.hsk_level}`));
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
    throw createRepositoryError(error, 'Failed to load reading word progress');
  }

  for (const state of data ?? []) {
    states.set(Number(state.target_id), state.stability === null ? null : Number(state.stability));
  }
  return states;
}

async function coverageForReading(summary: ReadingSummary, client: HanyuClient) {
  const functions = (client as any).functions;
  if (!functions || typeof functions.invoke !== 'function') {
    return null;
  }

  const { data, error } = await functions.invoke('tokenize-reading', {
    body: { reading_id: summary.slug },
  });
  if (error || !Array.isArray(data?.tokens)) {
    return null;
  }

  const tokens: CoverageToken[] = data.tokens.map((token: any) => ({
    word_id: typeof token.word?.id === 'number' ? token.word.id : null,
    type: token.type,
  }));
  const ids = [...new Set(tokens.map(token => token.word_id).filter((id): id is number => id !== null))];
  const states = await getRecognitionStates(ids, client);
  const known = new Set(
    [...states.entries()]
      .filter(([, stability]) => stability !== null && stability !== undefined && stability >= KNOWN_MIN_STABILITY_DAYS)
      .map(([id]) => id),
  );

  return coverageOf(tokens, known);
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
  const normalizedAnswers = answers || {};
  const results: any[] = [];

  (questions || []).forEach((question: any, index: number) => {
    const questionId = normalizeQuestionId(question, index);
    const correctOptionId = extractCorrectOptionId(question);
    const selectedOptionId = normalizedAnswers[questionId];
    const correct = selectedOptionId !== undefined && selectedOptionId === correctOptionId;

    if (correct) {
      score += 1;
    }

    results.push({
      question_id: questionId,
      selected_option_id: selectedOptionId,
      correct_option_id: correctOptionId,
      correct,
    });
  });

  return {
    score,
    total: Array.isArray(questions) ? questions.length : 0,
    results,
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
    throw createRepositoryError(existingError, 'Failed to read daily reading stats');
  }

  if (existing) {
    const { error } = await client
      .from('user_stats')
      .update({ readings_done: Number(existing.readings_done || 0) + 1 } as any)
      .eq('id', existing.id);

    if (error) {
      throw createRepositoryError(error, 'Failed to update daily reading stats');
    }

    return;
  }

  const { error } = await client.from('user_stats').insert({
    user_id: userId,
    date: today,
    readings_done: 1,
  } as any);

  if (error) {
    throw createRepositoryError(error, 'Failed to create daily reading stats');
  }
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
    throw createRepositoryError(error, 'Failed to load readings');
  }

  const summaries = (data || []).map(normalizeSummary);
  return Promise.all(summaries.map(async summary => ({
    ...summary,
    coverage: await coverageForReading(summary, client),
  })));
}

function normalizeSummary(row: any): ReadingSummary {
  const slug = String(row.slug);

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
    audio_kind: row.audio_kind === 'human' ? 'human' : 'tts',
    audio_url: row.audio_url === null || row.audio_url === undefined ? null : String(row.audio_url),
    ...(row.created_at ? { created_at: String(row.created_at) } : {}),
  };
}

async function loadReadingRow(slug: string, client: HanyuClient) {
  const { data, error } = await client
    .from('reading')
    .select(READING_SELECT)
    .eq('slug', slug)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to load reading detail');
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
    throw createRepositoryError(
      {
        status: (tokenError as any)?.status,
        code: (tokenError as any)?.code,
        message: 'Failed to prepare reading words',
      },
      'Failed to prepare reading words',
    );
  }

  const sentences = parseJsonField(data.sentences, []) as ReadingSentence[];
  const wordIds: number[] = tokenData.tokens
    .map((token: any) => token.word?.id)
    .filter((id: unknown): id is number => typeof id === 'number');
  const recognitionStates = await getRecognitionStates([...new Set(wordIds)], client);
  const tokens = statusTokens(tokenData.tokens, normalizeSummary(data).target_words, recognitionStates);
  const tokenizedSentences = tokensBySentence(sentences, tokens);
  const targetGrammar = normalizeGrammarTargets(data.target_grammar);

  return {
    ...normalizeSummary(data),
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
  } as any);

  if (!attemptError) {
    await incrementReadingStat(client, userId);
  }

  return localResult;
}
