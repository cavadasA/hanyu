import { useCallback, useEffect, useRef, useState } from 'react';
import {
  toUserMessage,
  type HskLevel,
  type ReadingSummary,
} from '@hanyu/data';
import { getData } from '../lib/data';

interface ReadingApi {
  getReadings(input: { level: HskLevel; topic?: string }): Promise<ReadingSummary[]>;
}

export function useReadings(api?: ReadingApi) {
  const defaultApi = useRef<ReadingApi | null>(null);
  if (!api && !defaultApi.current) {
    defaultApi.current = getData().readings;
  }
  const readingApi = api ?? defaultApi.current!;
  const [level, setLevel] = useState<HskLevel>(1);
  const [topic, setTopic] = useState<string | undefined>(undefined);
  const [readings, setReadings] = useState<ReadingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoading(true);
    setError(null);

    try {
      const result = await readingApi.getReadings({
        level,
        ...(topic ? { topic } : {}),
      });
      if (requestId.current === currentRequest) {
        setReadings(result);
      }
    } catch (caught) {
      if (requestId.current === currentRequest) {
        setError(toUserMessage(caught));
      }
    } finally {
      if (requestId.current === currentRequest) {
        setLoading(false);
      }
    }
  }, [level, readingApi, topic]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    level,
    topic,
    readings,
    loading,
    error,
    setLevel,
    setTopic,
    reload,
  };
}
