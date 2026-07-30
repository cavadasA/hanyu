import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReadingDetail, ReadingSummary } from '@hanyu/data';
import { useReadings } from './useReadings';

const firstReading: ReadingSummary = {
  id: 'reading-1',
  title: 'First greeting',
  hsk_level: 1,
  format: 'short_text',
  generated_at: '2026-07-30T10:00:00Z',
};

const storyReading: ReadingSummary = {
  id: 'reading-2',
  title: 'A short story',
  hsk_level: 2,
  format: 'story',
  generated_at: '2026-07-30T11:00:00Z',
};

const generatedReading: ReadingDetail = {
  ...storyReading,
  content: '你好。',
  pinyin_text: 'ni hao.',
  questions: [],
  tokens: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useReadings', () => {
  it('loads filters, ignores stale responses, and returns generated detail', async () => {
    const stale = deferred<{ readings: ReadingSummary[] }>();
    const fresh = deferred<{ readings: ReadingSummary[] }>();
    const api = {
      getReadings: jest.fn()
        .mockReturnValueOnce(stale.promise)
        .mockReturnValueOnce(fresh.promise),
      generateReading: jest.fn().mockResolvedValue(generatedReading),
    };
    const hook = await renderHook(() => useReadings(api));

    await waitFor(() => expect(api.getReadings).toHaveBeenCalledWith({
      level: 1,
      format: 'short_text',
    }));

    await act(async () => {
      hook.result.current.setLevel(2);
      hook.result.current.setFormat('story');
    });

    await waitFor(() => expect(api.getReadings).toHaveBeenLastCalledWith({
      level: 2,
      format: 'story',
    }));

    await act(async () => {
      stale.resolve({ readings: [firstReading] });
      fresh.resolve({ readings: [storyReading] });
      await fresh.promise;
    });

    expect(hook.result.current.readings).toEqual([storyReading]);

    let generated: ReadingDetail | null = null;
    await act(async () => {
      generated = await hook.result.current.generate();
    });

    expect(generated).toEqual(generatedReading);
    expect(api.generateReading).toHaveBeenCalledWith(2, 'story');
    expect(api.getReadings).toHaveBeenCalledTimes(3);
  });
});
