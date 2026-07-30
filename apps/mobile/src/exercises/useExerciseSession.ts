import { useCallback, useRef, useState } from 'react';
import {
  toUserMessage,
  type Exercise,
  type ExerciseCheckResult,
  type ExerciseType,
  type HskLevel,
} from '@hanyu/data';
import { getData } from '../lib/data';

type Status = 'idle' | 'loading' | 'answering' | 'checking' | 'checked' | 'error';

interface ExerciseApi {
  generateExercise(type: ExerciseType, level: HskLevel): Promise<Exercise>;
  checkExercise(id: string, answer: unknown): Promise<ExerciseCheckResult>;
}

export interface ExerciseSession {
  status: Status;
  type: ExerciseType;
  level: HskLevel;
  exercise: Exercise | null;
  draft: unknown;
  result: ExerciseCheckResult | null;
  error: string | null;
  setType(type: ExerciseType): void;
  setLevel(level: HskLevel): void;
  setDraft(value: unknown): void;
  load(): Promise<void>;
  check(): Promise<void>;
  next(): Promise<void>;
}

export function useExerciseSession(
  api: ExerciseApi = getData().exercises,
): ExerciseSession {
  const [status, setStatus] = useState<Status>('idle');
  const [type, setType] = useState<ExerciseType>('fill_blank');
  const [level, setLevel] = useState<HskLevel>(2);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [draft, setDraft] = useState<unknown>(null);
  const [result, setResult] = useState<ExerciseCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const nextExercise = await api.generateExercise(type, level);
      setExercise(nextExercise);
      setDraft(null);
      setResult(null);
      setStatus('answering');
    } catch (caught) {
      setError(toUserMessage(caught));
      setStatus('error');
    }
  }, [api, level, type]);

  const check = useCallback(async () => {
    if (checking.current || status !== 'answering' || !exercise || draft === null) {
      return;
    }

    checking.current = true;
    setStatus('checking');
    setError(null);

    try {
      const checkResult = await api.checkExercise(exercise.id, draft);
      setResult(checkResult);
      setStatus('checked');
    } catch (caught) {
      setError(toUserMessage(caught));
      setStatus('answering');
    } finally {
      checking.current = false;
    }
  }, [api, draft, exercise, status]);

  const next = useCallback(async () => {
    await load();
  }, [load]);

  return {
    status,
    type,
    level,
    exercise,
    draft,
    result,
    error,
    setType,
    setLevel,
    setDraft,
    load,
    check,
    next,
  };
}
