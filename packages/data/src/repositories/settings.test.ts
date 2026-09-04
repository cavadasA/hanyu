import { describe, expect, it, vi } from 'vitest';
import { getSettings, updateSettings } from './settings';

function clientFor(userSettings: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(userSettings),
    upsert: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: userSettings.data, error: userSettings.error }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.upsert.mockReturnValue(chain);

  return {
    chains: { user_settings: chain },
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'u1' } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue(chain),
  };
}

describe('getSettings', () => {
  it('preserves the settings row identity and timestamps', async () => {
    const row = {
      user_id: 'user-1',
      theme: 'dark',
      support_language: 'es',
      current_level: 4,
      new_cards_per_day: 25,
      review_limit_per_day: 120,
      session_size: 25,
      request_retention: 0.85,
      card_order: 'frequency',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-30T00:00:00.000Z',
    };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue(query),
    };

    const settings = await getSettings(client as never);

    expect(settings).toEqual({
      api_key: '',
      ...row,
    });
  });

  it('expone los cuatro límites por separado', async () => {
    const client = clientFor({
      data: {
        user_id: 'u1',
        theme: 'light',
        support_language: 'es',
        current_level: 2,
        new_cards_per_day: 15,
        review_limit_per_day: 150,
        session_size: 25,
        card_order: 'due',
        request_retention: 0.9,
      },
      error: null,
    });

    const settings = await getSettings(client as never);

    expect(settings.new_cards_per_day).toBe(15);
    expect(settings.review_limit_per_day).toBe(150);
    expect(settings.session_size).toBe(25);
  });

  it('acepta cero tarjetas nuevas al día como decisión válida', async () => {
    const client = clientFor({ data: null, error: null });

    await updateSettings({ new_cards_per_day: 0 }, client as never);

    expect(client.chains.user_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ new_cards_per_day: 0 }),
      expect.anything(),
    );
  });

  it('recorta un tamaño de sesión imposible en vez de propagarlo', async () => {
    const client = clientFor({ data: null, error: null });

    await updateSettings({ session_size: 9999 }, client as never);

    expect(client.chains.user_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ session_size: 200 }),
      expect.anything(),
    );
  });

  it('ya no ofrece un proveedor de IA', async () => {
    const client = clientFor({
      data: {
        user_id: 'u1',
        theme: 'light',
        support_language: 'es',
        current_level: 2,
        new_cards_per_day: 10,
        review_limit_per_day: 200,
        session_size: 20,
        request_retention: 0.9,
        card_order: 'due',
      },
      error: null,
    });

    const settings = await getSettings(client as never);

    expect('ai_provider' in settings).toBe(false);
    expect('api_key_configured' in settings).toBe(false);
  });
});
