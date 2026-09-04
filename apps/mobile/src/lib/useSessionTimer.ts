import { useCallback, useEffect, useRef, useState } from 'react';

export function useSessionTimer() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limitRef = useRef<number | null>(null);

  const start = useCallback((durationSeconds?: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    limitRef.current = Number.isFinite(durationSeconds) && Number(durationSeconds) > 0
      ? Math.max(1, Math.trunc(Number(durationSeconds)))
      : null;
    setElapsed(0);
    intervalRef.current = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (limitRef.current !== null && next >= limitRef.current) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          return limitRef.current;
        }
        return next;
      });
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    limitRef.current = null;
    setElapsed(0);
  }, [stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const formatted = `${minutes}:${String(seconds).padStart(2, '0')}`;
  const expired = limitRef.current !== null && elapsed >= limitRef.current;

  return { elapsed, formatted, expired, start, stop, reset };
}
