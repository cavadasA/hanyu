import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReadingSummary } from '@hanyu/data';
import { useReadings } from './useReadings';

const firstReading: ReadingSummary = {
  id: 'reading-1',
  slug: 'reading-1',
  title: 'First greeting',
  hsk_level: 1,
  format: 'short_text',
  topic: 'saludos',
  series: null,
  series_index: null,
  target_words: [],
  target_grammar: [],
  audio_kind: 'tts',
  audio_url: null,
};

const storyReading: ReadingSummary = {
  id: 'reading-2',
  slug: 'reading-2',
  title: 'A short story',
  hsk_level: 2,
  format: 'story',
  topic: 'estudio',
  series: 'escuela',
  series_index: 1,
  target_words: ['同学'],
  target_grammar: ['6.3.5'],
  audio_kind: 'tts',
  audio_url: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useReadings', () => {
  it('loads filters and ignores stale responses', async () => {
    const stale = deferred<ReadingSummary[]>();
    const fresh = deferred<ReadingSummary[]>();
    const api = {
      getReadings: jest.fn()
        .mockReturnValueOnce(stale.promise)
        .mockReturnValueOnce(fresh.promise),
    };
    const hook = await renderHook(() => useReadings(api));

    await waitFor(() => expect(api.getReadings).toHaveBeenCalledWith({ level: 1 }));

    await act(async () => {
      hook.result.current.setLevel(2);
      hook.result.current.setTopic('estudio');
    });

    await waitFor(() => expect(api.getReadings).toHaveBeenLastCalledWith({ level: 2, topic: 'estudio' }));

    await act(async () => {
      stale.resolve([firstReading]);
      fresh.resolve([storyReading]);
      await fresh.promise;
    });

    expect(hook.result.current.readings).toEqual([storyReading]);
    expect(api.getReadings).toHaveBeenCalledTimes(2);
  });
});
