import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeClient = { auth: {} };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => fakeClient,
}));

const getTodayMock = vi.fn((_client?: unknown) => Promise.resolve({ ok: true }));
const sendPasswordResetMock = vi.fn(
  (_email?: string, _client?: unknown, _redirectTo?: string) => Promise.resolve(undefined)
);
const getReadingsMock = vi.fn();
const getReadingMock = vi.fn();

vi.mock('./repositories/today', () => ({
  getToday: (client: unknown) => getTodayMock(client as never),
}));

vi.mock('./repositories/readings', () => ({
  completeReading: vi.fn(),
  getReading: (slug: string, client: unknown) => getReadingMock(slug, client),
  getReadings: (params: unknown, client: unknown) => getReadingsMock(params, client),
  getReadingProgress: vi.fn(),
  markRead: vi.fn(),
  saveReadingProgress: vi.fn(),
  toggleBookmark: vi.fn(),
}));

vi.mock('./auth', () => ({
  getSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  subscribeToAuthChanges: vi.fn(),
  sendPasswordReset: (email: string, client: unknown, redirectTo?: string) =>
    sendPasswordResetMock(email as never, client as never, redirectTo as never),
}));

const { createHanyuData } = await import('./factory');

const config = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' };

describe('createHanyuData', () => {
  beforeEach(() => {
    getTodayMock.mockClear();
    sendPasswordResetMock.mockClear();
    getReadingsMock.mockReset();
    getReadingMock.mockReset();
  });

  it('binds the created client to every repository call', async () => {
    const data = createHanyuData(config);

    await data.today.getToday();

    expect(getTodayMock).toHaveBeenCalledWith(fakeClient);
  });

  it('injects the configured password reset redirect', async () => {
    const data = createHanyuData({ ...config, passwordResetRedirectTo: 'https://hanyu.app' });

    await data.auth.sendPasswordReset('learner@example.com');

    expect(sendPasswordResetMock).toHaveBeenCalledWith(
      'learner@example.com',
      fakeClient,
      'https://hanyu.app'
    );
  });

  it('exposes the whole repository surface', () => {
    const data = createHanyuData(config);

    expect(Object.keys(data).sort()).toEqual(
      ['auth', 'client', 'decks', 'events', 'exercises', 'flashcards', 'grammar', 'readings', 'settings', 'skills', 'stats', 'today', 'words'].sort()
    );
  });

  it('carga una lectura desde la caché cuando se pierde la red', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn(),
    };
    const reading = { id: 'reading-1', sentences: [{ zh: '你好。' }] };
    getReadingMock.mockResolvedValueOnce(reading).mockRejectedValueOnce(new Error('offline'));
    const data = createHanyuData({ ...config, storage });

    await expect(data.readings.getReading('reading-1')).resolves.toEqual(reading);
    await expect(data.readings.getReading('reading-1')).resolves.toEqual(reading);
    expect(storage.setItem).toHaveBeenCalled();
    expect(getReadingMock).toHaveBeenCalledTimes(2);
  });
});
