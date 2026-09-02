import type { HanyuClient } from '../client';
import { evaluateAnswer, toSolution } from '@hanyu/domain';
import type {
  Exercise,
  ExerciseAnswer,
  ExerciseCheckResult,
  ExercisePrompt,
  ExerciseType,
  HskLevel,
} from '../types';
import {
  createRepositoryError,
  getRequiredUserId,
  parseJsonField,
  toDateString,
} from './shared';

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

/**
 * Devuelve exactamente los campos del contrato. La versión anterior hacía
 * `...payload`, así que el cliente recibía `correct`, `sentence` y
 * `source_model` como campos sueltos junto al prompt ya normalizado: la
 * respuesta viajaba por accidente. Ahora viaja a propósito, en `solution`,
 * porque los ejercicios tienen que poder resolverse sin conexión.
 */
function normalizeExercise(payload: any): Exercise {
  const type = String(payload.type || 'fill_blank') as ExerciseType;

  return {
    id: String(payload.id),
    type,
    hsk_level: Number(payload.hsk_level) as HskLevel,
    prompt: toExercisePrompt(type, payload),
    solution: toSolution(type, payload, payload.answer ?? null),
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
    answer: parseJsonField(row.answer, row.answer),
    explanation: prompt.explanation ?? null,
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

export async function generateExercise(
  type: ExerciseType,
  level: HskLevel,
  client: HanyuClient,
): Promise<Exercise> {
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
  answer: ExerciseAnswer,
  client: HanyuClient,
): Promise<ExerciseCheckResult> {
  // No hay comprobación de servidor. La versión anterior intentaba una RPC
  // `check_exercise` con tres firmas distintas y después una Edge Function
  // `check-exercise`: cuatro viajes de red que siempre fallaban, porque
  // ninguna de las dos existe. La evaluación es local a propósito y la regla
  // vive en @hanyu/domain, lista para ejecutarse en servidor si algún día se
  // necesita autoridad.
  const userId = await getRequiredUserId(client);

  const { data: exerciseRow, error: exerciseError } = await client
    .from('generated_exercises')
    .select('id, type, prompt, answer')
    .eq('id', id as any)
    .single();

  if (exerciseError) {
    throw createRepositoryError(exerciseError, 'Failed to load exercise for local scoring');
  }

  const row = exerciseRow as any;
  const prompt = parseJsonField(row.prompt, {});
  const storedAnswer = parseJsonField(row.answer, row.answer);
  const solution = toSolution(row.type, prompt, storedAnswer);
  const evaluation = evaluateAnswer(solution, answer);

  const { error: attemptError } = await client.from('exercise_attempts').insert({
    user_id: userId,
    exercise_id: id,
    correct: evaluation.correct,
    submitted_answer: answer,
  } as any);

  if (attemptError) {
    throw createRepositoryError(attemptError, 'Failed to record exercise attempt');
  }

  await incrementExerciseDone(client, userId);

  return {
    correct: evaluation.correct,
    expected_answer: evaluation.solution,
    submitted_answer: evaluation.answer,
    detail: evaluation.detail,
    explanation: prompt?.explanation ?? null,
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
