import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage, type HskLevel, type Word, type WordPage } from '@hanyu/data';
import { getData } from '../lib/data';

const PAGE_SIZE = 20;

interface WordsApi {
  getWords(input: {
    search: string;
    level: HskLevel | undefined;
    page: number;
    page_size: number;
  }): Promise<WordPage>;
}

export function useWords(api?: WordsApi) {
  const defaultApi = useRef<WordsApi | null>(null);
  if (!api && !defaultApi.current) {
    defaultApi.current = getData().words;
  }
  const wordsApi = api ?? defaultApi.current!;

  const [query, setQueryValue] = useState('');
  const [level, setLevelValue] = useState<HskLevel | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [words, setWords] = useState<Word[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoading(true);
    setError(null);

    try {
      const result = await wordsApi.getWords({
        search: query,
        level,
        page,
        page_size: PAGE_SIZE,
      });
      if (requestId.current === currentRequest) {
        setWords(result.items);
        setTotal(result.total);
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
  }, [level, page, query, wordsApi]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void load();
    }, 300);

    return () => clearTimeout(timeout);
  }, [load]);

  const setQuery = useCallback((value: string) => {
    setQueryValue(value);
    setPage(1);
  }, []);

  const setLevel = useCallback((value: HskLevel | undefined) => {
    setLevelValue(value);
    setPage(1);
  }, []);

  const canPrevious = page > 1;
  const canNext = page * PAGE_SIZE < total;

  return {
    query,
    level,
    page,
    pageSize: PAGE_SIZE,
    words,
    total,
    loading,
    error,
    canPrevious,
    canNext,
    setQuery,
    setLevel,
    previousPage: () => {
      if (canPrevious) {
        setPage(current => Math.max(1, current - 1));
      }
    },
    nextPage: () => {
      if (canNext) {
        setPage(current => current + 1);
      }
    },
    reload: load,
  };
}
