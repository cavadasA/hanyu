import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn(() => ({ auth: {} }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...(args as [])),
}));

const { createSupabaseClient } = await import('./client');

describe('createSupabaseClient', () => {
  beforeEach(() => {
    createClientMock.mockClear();
  });

  it('throws a configuration error when the url is missing', () => {
    expect(() =>
      createSupabaseClient({ supabaseUrl: '', supabaseAnonKey: 'anon' })
    ).toThrow(/Supabase is not configured/);
  });

  it('throws a configuration error when the anon key is missing', () => {
    expect(() =>
      createSupabaseClient({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: '' })
    ).toThrow(/Supabase is not configured/);
  });

  it('defaults detectSessionInUrl to false', () => {
    createSupabaseClient({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' });

    const options = (createClientMock.mock.calls[0] as unknown[])[2] as { auth: Record<string, unknown> };
    expect(options.auth.detectSessionInUrl).toBe(false);
    expect(options.auth.persistSession).toBe(true);
    expect(options.auth.autoRefreshToken).toBe(true);
  });

  it('forwards the injected storage and detectSessionInUrl', () => {
    const storage = {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };

    createSupabaseClient({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon',
      storage,
      detectSessionInUrl: true,
    });

    const options = (createClientMock.mock.calls[0] as unknown[])[2] as { auth: Record<string, unknown> };
    expect(options.auth.storage).toBe(storage);
    expect(options.auth.detectSessionInUrl).toBe(true);
  });
});
