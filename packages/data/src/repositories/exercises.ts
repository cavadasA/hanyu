import type { HanyuClient } from '../client';
import { evaluateAnswer, toSolution } from '@hanyu/domain';
import type {
  Exercise,
  ExerciseAnswer,
  ExerciseCheckResult,
  ExerciseSession,
  ExercisePrompt,
  ExerciseType,
  HskLevel,
  Mistake,
  MockExam,
  MockExamScope,
  MockExamSection,
  MockExamUnsupported,
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
    ...(payload.slug ? { slug: String(payload.slug) } : {}),
    ...(payload.unit_code ? { unit_code: String(payload.unit_code) } : {}),
    target_word_id: payload.target_word_id == null ? null : Number(payload.target_word_id),
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
    slug: row.slug ?? prompt.slug,
    unit_code: row.unit_code ?? prompt.unit_code,
    target_word_id: row.target_word_id,
    answer: parseJsonField(row.answer, row.answer),
    explanation: prompt.explanation ?? null,
  });
}

function normalizeExerciseSession(payload: any): ExerciseSession {
  const session = parseJsonField(
    Array.isArray(payload) ? payload[0] : payload,
    {},
  );
  const exercises = Array.isArray(session?.exercises)
    ? session.exercises.map((exercise: any) => normalizeGeneratedExerciseRow(exercise))
    : [];

  return {
    unit_code: session?.unit_code ? String(session.unit_code) : null,
    unit_title: String(session?.unit_title ?? 'Unidad activa'),
    hsk_level: Number(session?.hsk_level ?? 2) as HskLevel,
    exercises,
    length: Number(session?.length ?? exercises.length),
  };
}

export async function getMistakes(client: HanyuClient, limit = 20): Promise<Mistake[]> {
  const { data, error } = await (client.rpc as any)('mistake_queue', {
    p_limit: Math.max(1, Math.trunc(Number(limit)) || 20),
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to load mistake queue');
  }

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row: any) => ({
      target_id: Number(row.target_id),
      ...(row.hanzi ? {
        word: {
          hanzi: String(row.hanzi),
          pinyin: String(row.pinyin ?? ''),
          meaning_es: row.meaning_es ? String(row.meaning_es) : null,
          meaning_en: String(row.meaning_en ?? ''),
        },
      } : {}),
      misses: Number(row.misses ?? 0),
      hits_since: Number(row.hits_since ?? 0),
      distinct_days: Number(row.distinct_days ?? 0),
    }));
}

function normalizeMockExam(payload: any): MockExam {
  const exam = parseJsonField(Array.isArray(payload) ? payload[0] : payload, {});
  const sections = Array.isArray(exam?.sections)
    ? exam.sections.map((section: any): MockExamSection => ({
        code: String(section?.code ?? ''),
        title: String(section?.title ?? section?.code ?? ''),
        minutes: Number(section?.minutes ?? 0),
        exercises: Array.isArray(section?.exercises)
          ? section.exercises.map((exercise: any) => normalizeGeneratedExerciseRow(exercise))
          : [],
      }))
    : [];
  const unsupported = Array.isArray(exam?.unsupported)
    ? exam.unsupported.map((part: any): MockExamUnsupported => ({
        section: String(part?.section ?? ''),
        ...(part?.part ? { part: String(part.part) } : {}),
        reason: String(part?.reason ?? 'no_matching_type'),
      }))
    : [];

  return {
    hsk_level: Number(exam?.hsk_level ?? 1) as HskLevel,
    scope: exam?.scope === 'full' ? 'full' : 'section',
    sections,
    unsupported,
  };
}

export async function buildMockExam(
  level: HskLevel,
  scope: MockExamScope,
  client: HanyuClient,
  sectionCode?: string | null,
): Promise<MockExam> {
  const safeLevel = Math.min(3, Math.max(1, Math.trunc(Number(level)) || 2)) as HskLevel;
  const safeScope: MockExamScope = scope === 'full' ? 'full' : 'section';
  const params: Record<string, unknown> = {
    p_level: safeLevel,
    p_scope: safeScope,
  };
  if (sectionCode) params.p_section_code = sectionCode;

  const { data, error } = await (client.rpc as any)('build_mock_exam', params);

  if (error) {
    throw createRepositoryError(error, 'Failed to build mock exam');
  }

  return normalizeMockExam(data);
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

export async function buildExerciseSession(
  unitCode: string | null | undefined,
  length: number = 8,
  client: HanyuClient,
  targetWordIds: number[] = [],
): Promise<ExerciseSession> {
  const safeLength = Math.min(20, Math.max(1, Math.trunc(Number(length)) || 8));
  const params: Record<string, unknown> = {
    p_unit_code: unitCode ?? null,
    p_length: safeLength,
  };
  const safeTargetWordIds = targetWordIds
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (safeTargetWordIds.length > 0) params.p_target_word_ids = safeTargetWordIds;

  const { data, error } = await (client.rpc as any)('build_exercise_session', params);

  if (error) {
    throw createRepositoryError(error, 'Failed to build exercise session');
  }

  return normalizeExerciseSession(data);
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
      .select('id, type, hsk_level, target_word_id, prompt, answer, source_model, created_at')
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
  options: { hintUsed?: boolean } = {},
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
    .select('id, type, prompt, answer, target_word_id')
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
  const hintUsed = options.hintUsed === true;
  const countedAsCorrect = evaluation.correct && !hintUsed;

  const { error: attemptError } = await client.from('exercise_attempts').insert({
    user_id: userId,
    exercise_id: id,
    is_correct: countedAsCorrect,
    submitted_answer: answer,
    feedback: hintUsed ? { hint_used: true } : null,
  } as any);

  if (attemptError) {
    throw createRepositoryError(attemptError, 'Failed to record exercise attempt');
  }

  const targetWordId = row.target_word_id == null ? null : Number(row.target_word_id);
  const { error: eventError } = await client.from('learning_event').insert({
    user_id: userId,
    kind: 'exercise_attempted',
    target_kind: targetWordId !== null ? 'word' : null,
    target_id: targetWordId,
    skill: row.type === 'dictation' ? 'listening' : 'recall',
    payload: {
      exercise_id: id,
      correct: countedAsCorrect,
      answer_correct: evaluation.correct,
      hint_used: hintUsed,
    },
  } as any);

  if (eventError) {
    throw createRepositoryError(eventError, 'Failed to record exercise learning event');
  }

  await incrementExerciseDone(client, userId);

  return {
    correct: countedAsCorrect,
    answer_correct: evaluation.correct,
    counted_as_correct: countedAsCorrect,
    hint_used: hintUsed,
    expected_answer: evaluation.solution,
    submitted_answer: evaluation.answer,
    detail: evaluation.detail,
    explanation: hintUsed && evaluation.correct
      ? `${prompt?.explanation ?? ''} Has usado una pista: esta respuesta no cuenta como un acierto sin ayuda.`.trim()
      : prompt?.explanation ?? null,
  };
}

export async function recordHintUsed(exerciseId: string, client: HanyuClient): Promise<void> {
  const userId = await getRequiredUserId(client);
  const { data, error } = await client
    .from('generated_exercises')
    .select('target_word_id')
    .eq('id', exerciseId as any)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to load exercise for hint tracking');
  }

  const targetWordId = data?.target_word_id == null ? null : Number(data.target_word_id);
  const { error: eventError } = await client.from('learning_event').insert({
    user_id: userId,
    kind: 'hint_used',
    target_kind: targetWordId !== null ? 'word' : null,
    target_id: targetWordId,
    payload: { exercise_id: exerciseId, hint: 'options' },
  } as any);

  if (eventError) {
    throw createRepositoryError(eventError, 'Failed to record hint usage');
  }
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
