import { useCallback, useState } from 'react';
import { api } from '../services/api';

export function useExercise() {
  const [exercise, setExercise] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = useCallback(async (type, level) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.generateExercise(type, level);
      setExercise(data);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to generate exercise');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const check = useCallback(async (id, answer) => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.checkExercise(id, answer);
      setResult(data);
      return data;
    } catch (err) {
      setError(err.message || 'Failed to check answer');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { exercise, result, loading, error, generate, check };
}