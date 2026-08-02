import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeClient = { auth: {} };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => fakeClient,
}));

const getTodayMock = vi.fn((_client?: unknown) => Promise.resolve({ ok: true }));
const sendPasswordResetMock = vi.fn(
  (_email?: string, _client?: unknown, _redirectTo?: string) => Promise.resolve(undefined)
);

vi.mock('./repositories/today', () => ({
  getToday: (client: unknown) => getTodayMock(client as never),
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
      ['auth', 'client', 'decks', 'exercises', 'flashcards', 'grammar', 'readings', 'settings', 'stats', 'today', 'words'].sort()
    );
  });
});
