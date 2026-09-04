import type { HanyuClient } from '../client';
import type {
  HskLevel,
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

  return (data || []).map(normalizeSummary);
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
  const tokenizedSentences = tokensBySentence(sentences, tokenData.tokens);

  return {
    ...normalizeSummary(data),
    sentences: tokenizedSentences,
    content: sentences.map(sentence => sentence.zh).join(''),
    questions: normalizeQuestions(parseJsonField(data.questions, [])),
    tokens: tokenData.tokens,
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
