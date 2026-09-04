import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearReviewSession,
  loadReviewSession,
  saveReviewSession,
} from './reviewSessionStore';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    __reset: () => {
      store = {};
    },
  };
});

const snapshot = {
  session_id: 's1',
  deck_id: 'd1',
  card_ids: ['c1', 'c2', 'c3'],
  index: 1,
  mode: 'recognition' as const,
  started_at: Date.now(),
  reviewed: 1,
  stats: { reviewed: 1, correct: 1, again: 0 },
};

describe('reviewSessionStore', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __reset(): void }).__reset();
  });

  it('survives a fresh process, which a module variable does not', async () => {
    await saveReviewSession(snapshot);

    expect(await loadReviewSession()).toEqual(snapshot);
  });

  it('persists the study mode separately from the card skill', async () => {
    const studySnapshot = { ...snapshot, mode: 'learn' as const, skill: 'recall' as const };

    await saveReviewSession(studySnapshot);

    expect(await loadReviewSession()).toEqual(studySnapshot);
  });

  it('keeps the queue and the position, not just the counters', async () => {
    await saveReviewSession(snapshot);
    const restored = await loadReviewSession();

    expect(restored!.card_ids).toEqual(['c1', 'c2', 'c3']);
    expect(restored!.index).toBe(1);
  });

  it('discards a session that is no longer today', async () => {
    await saveReviewSession({ ...snapshot, started_at: Date.now() - 40 * 60 * 60 * 1000 });

    expect(await loadReviewSession()).toBeNull();
  });

  it('discards a stored value that does not have the expected shape', async () => {
    await AsyncStorage.setItem('hanyu.review-session', '{"nope":true}');

    expect(await loadReviewSession()).toBeNull();
  });

  it('clear removes it', async () => {
    await saveReviewSession(snapshot);
    await clearReviewSession();

    expect(await loadReviewSession()).toBeNull();
  });
});
