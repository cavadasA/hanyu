import type { HanyuClient } from '../client';
import type {
  HskLevel,
  ReadingDetail,
  ReadingFormat,
  ReadingResult,
  ReadingSummary,
} from '../types';
import {
  callRpcVariants,
  createRepositoryError,
  getRequiredUserId,
  parseJsonField,
  toDateString,
} from './shared';

const VALID_FORMATS = new Set(['short_text', 'story', 'dialogue']);

function normalizeQuestions(questions: unknown) {
  return (Array.isArray(questions) ? questions : []).map((question: any, index: number) => ({
    id: String(question.id ?? `q${index}`),
    prompt: String(question.prompt ?? question.question ?? ''),
    options: (Array.isArray(question.options) ? question.options : []).map((option: any) => ({
      id: String(option.id),
      text: String(option.text),
    })),
  }));
}

function normalizeQuestionId(question: any, index: number) {
  return question.id || `q${index}`;
}

function extractCorrectOptionId(question: any) {
  if (question.correct_option_id !== undefined) {
    return question.correct_option_id;
  }

  if (question.correct !== undefined) {
    return question.correct;
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

function normalizeCompletionResult(payload: any, fallbackQuestions: any[] = []) {
  const data = Array.isArray(payload) ? payload[0] : payload;
  return {
    score: Number(data?.score || 0),
    total: Number(data?.total || fallbackQuestions.length || 0),
    results: data?.results || [],
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
  params: { level?: HskLevel; format?: ReadingFormat; limit?: number } = {},
  client: HanyuClient,
): Promise<{ readings: ReadingSummary[] }> {
  const level = params.level ? parseInt(String(params.level), 10) : null;
  const format = params.format ? String(params.format) : '';
  const limit = Math.min(50, Math.max(1, parseInt(String(params.limit), 10) || 20));

  let query = client
    .from('generated_readings')
    .select('id, hsk_level, format, title, source_model, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (level && !Number.isNaN(level)) {
    query = query.eq('hsk_level', level);
  }

  if (format && VALID_FORMATS.has(format)) {
    query = query.eq('format', format);
  }

  const { data, error } = await query;
  if (error) {
    throw createRepositoryError(error, 'Failed to load readings');
  }

  return {
    readings: (data || []).map((row: any) => ({
      id: String(row.id),
      hsk_level: Number(row.hsk_level) as HskLevel,
      format: row.format as ReadingFormat,
      title: String(row.title),
      generated_at: row.created_at,
    })),
  };
}

async function loadReadingRow(id: string, client: HanyuClient) {
  const { data, error } = await client
    .from('generated_readings')
    .select('id, hsk_level, format, title, content, pinyin_text, questions, source_model, created_at')
    .eq('id', id as any)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to load reading detail');
  }

  return data as any;
}

export async function getReading(id: string, client: HanyuClient): Promise<ReadingDetail> {
  const data = await loadReadingRow(id, client);
  const { data: tokenData, error: tokenError } = await client.functions.invoke(
    'tokenize-reading',
    { body: { reading_id: id } },
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

  return {
    ...data,
    id: String(data.id),
    hsk_level: Number(data.hsk_level) as HskLevel,
    format: data.format as ReadingFormat,
    generated_at: data.created_at,
    questions: normalizeQuestions(parseJsonField(data.questions, [])),
    tokens: tokenData.tokens,
  };
}

export async function generateReading(
  level: HskLevel,
  format: ReadingFormat,
  client: HanyuClient,
): Promise<ReadingDetail> {
  const safeFormat = VALID_FORMATS.has(format) ? format : 'short_text';
  const { data, error } = await client.functions.invoke('generate-reading', {
    body: {
      level: parseInt(String(level), 10) || 1,
      format: safeFormat,
    },
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to generate reading');
  }

  if (!data) {
    throw new Error('Reading generation returned an empty payload.');
  }

  return getReading(String(data.id), client);
}

export async function completeReading(
  id: string,
  answers: Record<string, string>,
  client: HanyuClient,
): Promise<ReadingResult> {
  try {
    const rpcData = await callRpcVariants(client, 'submit_reading_attempt', [
      { reading_id: id, answers },
      { p_reading_id: id, p_answers: answers },
      { reading_id: id, p_answers: answers },
    ]);

    return normalizeCompletionResult(rpcData);
  } catch {
    // Fallback for local/dev environments without deployed RPC.
  }

  const reading = await loadReadingRow(id, client);
  const localResult = scoreLocally(parseJsonField(reading.questions, []), answers);
  const userId = await getRequiredUserId(client);

  const { error: attemptError } = await client.from('reading_attempts').insert({
    user_id: userId,
    reading_id: id as any,
    answers,
    score: localResult.score,
    total: localResult.total,
  } as any);

  if (!attemptError) {
    await incrementReadingStat(client, userId);
  }

  return localResult;
}
