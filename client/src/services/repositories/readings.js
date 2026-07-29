import { getSupabaseClient } from '../supabaseClient';
import {
  callRpcVariants,
  createRepositoryError,
  getRequiredUserId,
  parseJsonField,
  toDateString,
} from './shared';

const VALID_FORMATS = new Set(['short_text', 'story', 'dialogue']);

function normalizeQuestionId(question, index) {
  return question.id || `q${index}`;
}

function extractCorrectOptionId(question) {
  if (question.correct_option_id !== undefined) {
    return question.correct_option_id;
  }

  if (question.correct !== undefined) {
    return question.correct;
  }

  if (Array.isArray(question.options)) {
    const markedOption = question.options.find((option) => option?.correct === true);
    if (markedOption && markedOption.id !== undefined) {
      return markedOption.id;
    }
  }

  return null;
}

function scoreLocally(questions, answers) {
  let score = 0;
  const normalizedAnswers = answers || {};
  const results = [];

  (questions || []).forEach((question, index) => {
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

function normalizeCompletionResult(payload, fallbackQuestions = []) {
  const data = Array.isArray(payload) ? payload[0] : payload;
  return {
    score: Number(data?.score || 0),
    total: Number(data?.total || fallbackQuestions.length || 0),
    results: data?.results || [],
  };
}

async function incrementReadingStat(client, userId) {
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
      .update({ readings_done: Number(existing.readings_done || 0) + 1 })
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
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to create daily reading stats');
  }
}

export async function getReadings(params = {}, client = getSupabaseClient()) {
  const level = params.level ? parseInt(params.level, 10) : null;
  const format = params.format ? String(params.format) : '';
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));

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
    readings: (data || []).map((row) => ({
      ...row,
      generated_at: row.created_at,
    })),
  };
}

export async function getReading(id, client = getSupabaseClient()) {
  const { data, error } = await client
    .from('generated_readings')
    .select('id, hsk_level, format, title, content, pinyin_text, questions, source_model, created_at')
    .eq('id', id)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to load reading detail');
  }

  return {
    ...data,
    generated_at: data.created_at,
    questions: parseJsonField(data.questions, []),
  };
}

export async function generateReading(level, format, client = getSupabaseClient()) {
  const safeFormat = VALID_FORMATS.has(format) ? format : 'short_text';
  const { data, error } = await client.functions.invoke('generate-reading', {
    body: {
      level: parseInt(level, 10) || 1,
      format: safeFormat,
    },
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to generate reading');
  }

  if (!data) {
    throw new Error('Reading generation returned an empty payload.');
  }

  return {
    ...data,
    questions: parseJsonField(data.questions, data.questions || []),
  };
}

export async function completeReading(id, answers, client = getSupabaseClient()) {
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

  const reading = await getReading(id, client);
  const localResult = scoreLocally(reading.questions, answers);
  const userId = await getRequiredUserId(client);

  const { error: attemptError } = await client.from('reading_attempts').insert({
    user_id: userId,
    reading_id: id,
    answers,
    score: localResult.score,
    total: localResult.total,
  });

  if (!attemptError) {
    await incrementReadingStat(client, userId);
  }

  return localResult;
}