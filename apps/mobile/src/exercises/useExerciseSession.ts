import { useCallback, useMemo, useRef, useState } from 'react';
import { emptyAnswer, isAnswerComplete, orderExercises, type ExerciseAnswer } from '@hanyu/domain';
import {
  toUserMessage,
  type Exercise,
  type ExerciseCheckResult,
  type ExerciseSession as ExerciseSessionData,
} from '@hanyu/data';
import { getData } from '../lib/data';

type Status = 'idle' | 'loading' | 'ready' | 'answering' | 'checking' | 'checked' | 'complete' | 'error';

interface ExerciseApi {
  buildExerciseSession(unitCode?: string | null, length?: number, targetWordIds?: number[]): Promise<ExerciseSessionData>;
  checkExercise(id: string, answer: ExerciseAnswer, options?: { hintUsed?: boolean }): Promise<ExerciseCheckResult>;
  recordHintUsed?(id: string): Promise<void>;
}

export interface ExerciseSessionSummary {
  total: number;
  correct: number;
  incorrect: number;
}

export interface ExerciseSession {
  status: Status;
  unit: ExerciseSessionData | null;
  exercises: Exercise[];
  index: number;
  exercise: Exercise | null;
  draft: ExerciseAnswer;
  complete: boolean;
  progress: string;
  result: ExerciseCheckResult | null;
  hintUsed: boolean;
  hintPending: boolean;
  summary: ExerciseSessionSummary | null;
  error: string | null;
  load(targetWordIds?: number[]): Promise<void>;
  start(): void;
  setDraft(value: ExerciseAnswer): void;
  markHintUsed(): Promise<void>;
  check(): Promise<void>;
  next(): Promise<void>;
}

function uniqueExercises(exercises: Exercise[]): Exercise[] {
  const seen = new Set<string>();
  return exercises.filter((exercise, index) => {
    const key = String((exercise as Exercise & { slug?: string }).slug ?? exercise.id ?? index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function useExerciseSession(api?: ExerciseApi): ExerciseSession {
  const resolvedApi = useMemo(() => api ?? getData().exercises, [api]);
  const [status, setStatus] = useState<Status>('idle');
  const [unit, setUnit] = useState<ExerciseSessionData | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<ExerciseAnswer>(emptyAnswer('fill_blank'));
  const [result, setResult] = useState<ExerciseCheckResult | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [hintPending, setHintPending] = useState(false);
  const [summary, setSummary] = useState<ExerciseSessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);
  const exercise = exercises[index] ?? null;

  const load = useCallback(async (targetWordIds: number[] = []) => {
    setStatus('loading');
    setError(null);

    try {
      const nextSession = await resolvedApi.buildExerciseSession(null, 8, targetWordIds);
      const nextExercises = orderExercises(uniqueExercises(nextSession.exercises));
      setUnit({ ...nextSession, exercises: nextExercises, length: nextExercises.length });
      setExercises(nextExercises);
      setIndex(0);
      setDraft(emptyAnswer('fill_blank'));
      setResult(null);
      setHintUsed(false);
      setSummary(null);
      setStatus('ready');
    } catch (caught) {
      setError(toUserMessage(caught));
      setStatus('error');
    }
  }, [resolvedApi]);

  const start = useCallback(() => {
    if (exercises.length === 0) return;
    setIndex(0);
    setDraft(emptyAnswer(exercises[0].type));
    setResult(null);
    setHintUsed(false);
    setSummary({ total: exercises.length, correct: 0, incorrect: 0 });
    setError(null);
    setStatus('answering');
  }, [exercises]);

  const check = useCallback(async () => {
    if (
      checking.current ||
      hintPending ||
      status !== 'answering' ||
      !exercise ||
      !isAnswerComplete(exercise.solution, draft)
    ) {
      return;
    }

    checking.current = true;
    setStatus('checking');
    setError(null);

    try {
      const checkResult = await resolvedApi.checkExercise(exercise.id, draft, { hintUsed });
      setResult(checkResult);
      setSummary((current) => current ? {
        ...current,
        correct: current.correct + (checkResult.correct ? 1 : 0),
        incorrect: current.incorrect + (checkResult.correct ? 0 : 1),
      } : current);
      setStatus('checked');
    } catch (caught) {
      setError(toUserMessage(caught));
      setStatus('answering');
    } finally {
      checking.current = false;
    }
  }, [resolvedApi, draft, exercise, hintUsed, hintPending, status]);

  const next = useCallback(async () => {
    if (status !== 'checked') return;

    if (index >= exercises.length - 1) {
      setStatus('complete');
      return;
    }

    const nextIndex = index + 1;
    setIndex(nextIndex);
    setDraft(emptyAnswer(exercises[nextIndex].type));
    setResult(null);
    setHintUsed(false);
    setStatus('answering');
  }, [exercises, index, status]);

  const markHintUsed = useCallback(async () => {
    if (!exercise || status !== 'answering' || hintPending || hintUsed) return;

    setHintUsed(true);
    if (!resolvedApi.recordHintUsed) return;

    setHintPending(true);
    try {
      await resolvedApi.recordHintUsed(exercise.id);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setHintPending(false);
    }
  }, [exercise, hintPending, hintUsed, resolvedApi, status]);

  const complete = exercise ? isAnswerComplete(exercise.solution, draft) : false;
  const progress = exercise ? `${index + 1}/${exercises.length}` : `0/${exercises.length}`;

  return {
    status,
    unit,
    exercises,
    index,
    exercise,
    draft,
    complete,
    progress,
    result,
    hintUsed,
    hintPending,
    summary,
    error,
    load,
    start,
    setDraft,
    markHintUsed,
    check,
    next,
  };
}
