import { useCallback, useMemo, useRef, useState } from 'react';
import { emptyAnswer, isAnswerComplete, orderExercises, type ExerciseAnswer } from '@hanyu/domain';
import {
  toUserMessage,
  type Exercise,
  type ExerciseCheckResult,
  type ExerciseSession as ExerciseSessionData,
  type HskLevel,
  type MockExam,
  type MockExamScope,
} from '@hanyu/data';
import { getData } from '../lib/data';

type Status = 'idle' | 'loading' | 'ready' | 'answering' | 'checking' | 'checked' | 'complete' | 'error';

interface ExerciseApi {
  buildExerciseSession(unitCode?: string | null, length?: number): Promise<ExerciseSessionData>;
  buildMockExam?(level: HskLevel, scope: MockExamScope): Promise<MockExam>;
  checkExercise(id: string, answer: ExerciseAnswer): Promise<ExerciseCheckResult>;
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
  summary: ExerciseSessionSummary | null;
  error: string | null;
  buildMockExam(level: HskLevel, scope?: MockExamScope): Promise<MockExam>;
  load(): Promise<void>;
  start(): void;
  setDraft(value: ExerciseAnswer): void;
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
  const [summary, setSummary] = useState<ExerciseSessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);
  const exercise = exercises[index] ?? null;

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const nextSession = await resolvedApi.buildExerciseSession(null, 8);
      const nextExercises = orderExercises(uniqueExercises(nextSession.exercises));
      setUnit({ ...nextSession, exercises: nextExercises, length: nextExercises.length });
      setExercises(nextExercises);
      setIndex(0);
      setDraft(emptyAnswer('fill_blank'));
      setResult(null);
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
    setSummary({ total: exercises.length, correct: 0, incorrect: 0 });
    setError(null);
    setStatus('answering');
  }, [exercises]);

  const check = useCallback(async () => {
    if (
      checking.current ||
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
      const checkResult = await resolvedApi.checkExercise(exercise.id, draft);
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
  }, [resolvedApi, draft, exercise, status]);

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
    setStatus('answering');
  }, [exercises, index, status]);

  const buildMockExam = useCallback(async (level: HskLevel, scope: MockExamScope = 'section') => {
    if (!resolvedApi.buildMockExam) {
      throw new Error('El simulacro no está disponible todavía.');
    }

    return resolvedApi.buildMockExam(level, scope);
  }, [resolvedApi]);

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
    summary,
    error,
    buildMockExam,
    load,
    start,
    setDraft,
    check,
    next,
  };
}
