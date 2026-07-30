import { useCallback, useEffect, useRef, useState } from 'react';
import {
  toUserMessage,
  type HskLevel,
  type ReadingDetail,
  type ReadingFormat,
  type ReadingSummary,
} from '@hanyu/data';
import { getData } from '../lib/data';

interface ReadingApi {
  getReadings(input: { level: HskLevel; format: ReadingFormat }): Promise<{ readings: ReadingSummary[] }>;
  generateReading(level: HskLevel, format: ReadingFormat): Promise<ReadingDetail>;
}

export function useReadings(api?: ReadingApi) {
  const defaultApi = useRef<ReadingApi | null>(null);
  if (!api && !defaultApi.current) {
    defaultApi.current = getData().readings;
  }
  const readingApi = api ?? defaultApi.current!;
  const [level, setLevel] = useState<HskLevel>(1);
  const [format, setFormat] = useState<ReadingFormat>('short_text');
  const [readings, setReadings] = useState<ReadingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoading(true);
    setError(null);

    try {
      const result = await readingApi.getReadings({ level, format });
      if (requestId.current === currentRequest) {
        setReadings(result.readings);
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
  }, [format, level, readingApi]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);

    try {
      const detail = await readingApi.generateReading(level, format);
      void reload();
      return detail;
    } catch (caught) {
      setError(toUserMessage(caught));
      return null;
    } finally {
      setGenerating(false);
    }
  }, [format, level, readingApi, reload]);

  return {
    level,
    format,
    readings,
    loading,
    generating,
    error,
    setLevel,
    setFormat,
    reload,
    generate,
  };
}
