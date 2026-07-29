import { getSupabaseClient } from '../supabaseClient';
import {
  callRpcVariants,
  createRepositoryError,
  getRequiredUserId,
  parseJsonField,
  toDateString,
} from './shared';

function normalizeCheckResult(payload) {
  const data = Array.isArray(payload) ? payload[0] : payload;
  const correct = Boolean(data?.correct ?? data?.is_correct ?? false);
  const correctAnswer =
    data?.correct_answer ??
    data?.answer ??
    data?.canonical_answer ??
    null;

  return {
    ...data,
    correct,
    correct_answer: correctAnswer,
  };
}

function normalizeGeneratedExerciseRow(row) {
  const prompt = parseJsonField(row.prompt, {});

  return {
    id: row.id,
    ...prompt,
    type: prompt.type || row.type,
    hsk_level: row.hsk_level,
    source_model: row.source_model,
  };
}

async function incrementExerciseDone(client, userId) {
  const today = toDateString();
  const { data: existing, error: existingError } = await client
    .from('user_stats')
    .select('id, exercises_done')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (existingError) {
    throw createRepositoryError(existingError, 'Failed to load exercise stats');
  }

  if (existing) {
    const { error } = await client
      .from('user_stats')
      .update({ exercises_done: Number(existing.exercises_done || 0) + 1 })
      .eq('id', existing.id);

    if (error) {
      throw createRepositoryError(error, 'Failed to update exercise stats');
    }

    return;
  }

  const { error } = await client.from('user_stats').insert({
    user_id: userId,
    date: today,
    exercises_done: 1,
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to create exercise stats row');
  }
}

function evaluateExercise(exerciseType, prompt, answerValue, submittedAnswer) {
  switch (exerciseType) {
    case 'reorder': {
      const expected = Array.isArray(prompt?.correct_order)
        ? prompt.correct_order.join('')
        : String(answerValue || '');
      return {
        correct: submittedAnswer === expected,
        correct_answer: expected,
      };
    }
    case 'matching':
      return {
        correct: submittedAnswer === 'matched',
        correct_answer: 'matched',
      };
    case 'dictation': {
      const normalized = String(submittedAnswer ?? '').trim().toLowerCase();
      const expected = String(prompt?.audio_text || answerValue || '').trim().toLowerCase();
      const pinyin = String(prompt?.pinyin || '').trim().toLowerCase();
      const correct = normalized === expected || (prompt?.accept_pinyin && normalized === pinyin);

      return {
        correct,
        correct_answer: prompt?.audio_text || answerValue || null,
      };
    }
    default:
      return {
        correct: answerValue === submittedAnswer,
        correct_answer: answerValue,
      };
  }
}

export async function generateExercise(type, level, client = getSupabaseClient()) {
  try {
    const { data, error } = await client.functions.invoke('generate-exercise', {
      body: { type, level },
    });

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Exercise generation returned an empty payload.');
    }

    return data;
  } catch {
    const { data, error } = await client
      .from('generated_exercises')
      .select('id, type, hsk_level, prompt, answer, source_model, created_at')
      .eq('type', type)
      .eq('hsk_level', parseInt(level, 10) || 1)
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) {
      throw createRepositoryError(error, 'Failed to load fallback exercises');
    }

    if (!data || data.length === 0) {
      throw new Error('No cached exercises are available for this type and level.');
    }

    const selected = data[Math.floor(Math.random() * data.length)];
    return normalizeGeneratedExerciseRow(selected);
  }
}

export async function checkExercise(id, answer, client = getSupabaseClient()) {
  try {
    const rpcData = await callRpcVariants(client, 'check_exercise', [
      { exercise_id: id, submitted_answer: answer },
      { p_exercise_id: id, p_submitted_answer: answer },
      { id, answer },
    ]);

    return normalizeCheckResult(rpcData);
  } catch {
    const { data, error } = await client.functions.invoke('check-exercise', {
      body: { id, answer },
    });

    if (!error) {
      return normalizeCheckResult(data);
    }
  }

  const userId = await getRequiredUserId(client);
  const { data: exerciseRow, error: exerciseError } = await client
    .from('generated_exercises')
    .select('id, type, prompt, answer')
    .eq('id', id)
    .single();

  if (exerciseError) {
    throw createRepositoryError(exerciseError, 'Failed to load exercise for local scoring');
  }

  const prompt = parseJsonField(exerciseRow.prompt, {});
  const answerValue = parseJsonField(exerciseRow.answer, exerciseRow.answer);
  const evaluation = evaluateExercise(exerciseRow.type, prompt, answerValue, answer);

  const { error: attemptError } = await client.from('exercise_attempts').insert({
    user_id: userId,
    exercise_id: exerciseRow.id,
    submitted_answer: answer,
    is_correct: Boolean(evaluation.correct),
    feedback: {
      correct_answer: evaluation.correct_answer,
    },
  });

  if (attemptError) {
    throw createRepositoryError(attemptError, 'Failed to record exercise attempt');
  }

  await incrementExerciseDone(client, userId);

  return {
    correct: Boolean(evaluation.correct),
    correct_answer: evaluation.correct_answer,
  };
}

export async function getExerciseHistory(limit = 20, client = getSupabaseClient()) {
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const { data, error } = await client
    .from('generated_exercises')
    .select('id, type, hsk_level, prompt, answer, source_model, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw createRepositoryError(error, 'Failed to load exercise history');
  }

  return {
    exercises: (data || []).map((row) => ({
      ...row,
      prompt: parseJsonField(row.prompt, {}),
      answer: parseJsonField(row.answer, row.answer),
      generated_at: row.created_at,
    })),
  };
}