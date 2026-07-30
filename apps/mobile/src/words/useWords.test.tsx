import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Word, WordPage } from '@hanyu/data';
import { useWords } from './useWords';

const nihao: Word = {
  id: 1,
  hanzi: '你好',
  pinyin: 'ni hao',
  meaning_en: 'hello',
  meaning_es: null,
  hsk_level: 1,
  pos: 'phrase',
  frequency: null,
  in_srs: false,
};

function page(items: Word[], total = items.length): WordPage {
  return {
    items,
    page: 1,
    page_size: 20,
    total,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useWords', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces searches, resets pages, and ignores stale responses', async () => {
    const first = deferred<WordPage>();
    const second = deferred<WordPage>();
    const api = {
      getWords: jest.fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    };
    const hook = await renderHook(() => useWords(api));

    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(api.getWords).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    await waitFor(() => expect(api.getWords).toHaveBeenCalledWith({
      search: '',
      level: undefined,
      page: 1,
      page_size: 20,
    }));

    await act(async () => {
      hook.result.current.nextPage();
      hook.result.current.setQuery('ni');
      hook.result.current.setLevel(2);
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => expect(api.getWords).toHaveBeenLastCalledWith({
      search: 'ni',
      level: 2,
      page: 1,
      page_size: 20,
    }));

    await act(async () => {
      first.resolve(page([{ ...nihao, id: 1, hanzi: '旧' }], 1));
      second.resolve(page([nihao], 1));
      await second.promise;
    });

    expect(hook.result.current.words).toEqual([nihao]);
    expect(hook.result.current.canPrevious).toBe(false);
    expect(hook.result.current.canNext).toBe(false);
  });
});
