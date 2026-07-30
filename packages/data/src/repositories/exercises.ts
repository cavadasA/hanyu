import type { HanyuClient } from '../client';
import type {
  Exercise,
  ExerciseCheckResult,
  ExercisePrompt,
  ExerciseType,
  HskLevel,
} from '../types';
import {
  callRpcVariants,
  createRepositoryError,
  getRequiredUserId,
  parseJsonField,
  toDateString,
} from './shared';

function normalizeCheckResult(payload: any, submittedAnswer?: unknown): ExerciseCheckResult {
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
    expected_answer: correctAnswer,
    submitted_answer: data?.submitted_answer ?? submittedAnswer ?? null,
    explanation: data?.explanation ?? data?.feedback?.explanation ?? null,
  };
}

function toExercisePrompt(type: ExerciseType, payload: any): ExercisePrompt {
  switch (type) {
    case 'fill_blank':
      return {
        kind: type,
        sentence: String(payload.sentence ?? ''),
        options: Array.isArray(payload.options) ? payload.options.map(String) : undefined,
      };
    case 'multiple_choice':
      return {
        kind: type,
        question: String(payload.question ?? ''),
        options: Array.isArray(payload.options) ? payload.options.map(String) : [],
      };
    case 'reorder':
      return {
        kind: type,
        tokens: (payload.tokens ?? payload.words ?? []).map(String),
      };
    case 'dictation':
      return {
        kind: type,
        audio_text: String(payload.audio_text ?? ''),
        pinyin: payload.pinyin ? String(payload.pinyin) : undefined,
        accept_pinyin: Boolean(payload.accept_pinyin),
      };
    case 'matching':
      return {
        kind: type,
        pairs: Array.isArray(payload.pairs)
          ? payload.pairs.map((pair: any) => ({
              left: String(pair.left ?? ''),
              right: String(pair.right ?? ''),
            }))
          : [],
      };
  }
}

function normalizeExercise(payload: any): Exercise & Record<string, unknown> {
  const type = String(payload.type || 'fill_blank') as ExerciseType;
  return {
    ...payload,
    id: String(payload.id),
    type,
    hsk_level: Number(payload.hsk_level) as HskLevel,
    prompt: toExercisePrompt(type, payload),
    explanation: payload.explanation ?? null,
  };
}

function normalizeGeneratedExerciseRow(row: any) {
  const prompt = parseJsonField(row.prompt, {});

  return normalizeExercise({
    id: row.id,
    ...prompt,
    type: prompt.type || row.type,
    hsk_level: row.hsk_level,
    source_model: row.source_model,
  });
}

async function incrementExerciseDone(client: HanyuClient, userId: string) {
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
      .update({ exercises_done: Number(existing.exercises_done || 0) + 1 } as any)
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
  } as any);

  if (error) {
    throw createRepositoryError(error, 'Failed to create exercise stats row');
  }
}

function evaluateExercise(exerciseType: string, prompt: any, answerValue: any, submittedAnswer: any) {
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

export async function generateExercise(
  type: ExerciseType,
  level: HskLevel,
  client: HanyuClient,
): Promise<Exercise & Record<string, unknown>> {
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

    return normalizeExercise(data);
  } catch {
    const { data, error } = await client
      .from('generated_exercises')
      .select('id, type, hsk_level, prompt, answer, source_model, created_at')
      .eq('type', type)
      .eq('hsk_level', parseInt(String(level), 10) || 1)
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

export async function checkExercise(
  id: string,
  answer: unknown,
  client: HanyuClient,
): Promise<ExerciseCheckResult> {
  try {
    const rpcData = await callRpcVariants(client, 'check_exercise', [
      { exercise_id: id, submitted_answer: answer },
      { p_exercise_id: id, p_submitted_answer: answer },
      { id, answer },
    ]);

    return normalizeCheckResult(rpcData, answer);
  } catch {
    const { data, error } = await client.functions.invoke('check-exercise', {
      body: { id, answer },
    });

    if (!error) {
      return normalizeCheckResult(data, answer);
    }
  }

  const userId = await getRequiredUserId(client);
  const { data: exerciseRow, error: exerciseError } = await client
    .from('generated_exercises')
    .select('id, type, prompt, answer')
    .eq('id', id as any)
    .single();

  if (exerciseError) {
    throw createRepositoryError(exerciseError, 'Failed to load exercise for local scoring');
  }

  const prompt = parseJsonField((exerciseRow as any).prompt, {});
  const answerValue = parseJsonField((exerciseRow as any).answer, (exerciseRow as any).answer);
  const evaluation = evaluateExercise((exerciseRow as any).type, prompt, answerValue, answer);

  const { error: attemptError } = await client.from('exercise_attempts').insert({
    user_id: userId,
    exercise_id: (exerciseRow as any).id,
    submitted_answer: answer,
    is_correct: Boolean(evaluation.correct),
    feedback: {
      correct_answer: evaluation.correct_answer,
    },
  } as any);

  if (attemptError) {
    throw createRepositoryError(attemptError, 'Failed to record exercise attempt');
  }

  await incrementExerciseDone(client, userId);

  return {
    correct: Boolean(evaluation.correct),
    correct_answer: evaluation.correct_answer,
    expected_answer: evaluation.correct_answer,
    submitted_answer: answer,
    explanation: null,
  };
}

export async function getExerciseHistory(limit: number = 20, client: HanyuClient) {
  const safeLimit = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 20));
  const { data, error } = await client
    .from('generated_exercises')
    .select('id, type, hsk_level, prompt, answer, source_model, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw createRepositoryError(error, 'Failed to load exercise history');
  }

  return {
    exercises: (data || []).map((row: any) => ({
      ...row,
      prompt: parseJsonField(row.prompt, {}),
      answer: parseJsonField(row.answer, row.answer),
      generated_at: row.created_at,
    })),
  };
}
