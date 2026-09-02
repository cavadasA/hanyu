import { describe, expect, it, vi } from 'vitest';
import { getSettings } from './settings';

describe('getSettings', () => {
  it('preserves the settings row identity and timestamps', async () => {
    const row = {
      user_id: 'user-1',
      theme: 'dark',
      support_language: 'es',
      current_level: 4,
      cards_per_day: 25,
      max_reviews_per_session: 120,
      card_order: 'frequency',
      ai_provider: 'gemini',
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
      ...row,
      api_key: '',
      api_key_configured: false,
    });
  });
});
