import { describe, expect, it, vi } from 'vitest';
import { getToday } from './today';

function clientFor() {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [{ deck_id: null, count: 150 }], error: null })
    .mockResolvedValueOnce({ data: [{ deck_id: null, count: 3 }], error: null });

  const from = vi.fn((table: string) => {
    if (table === 'user_settings') {
      const s = { select: vi.fn() };
      s.select.mockReturnValue({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { user_id: 'u1', max_reviews_per_session: 100, card_order: 'due', cards_per_day: 20, current_level: 2, theme: 'light', ai_provider: 'none' },
            error: null,
          }),
        })),
      });
      return s;
    }

    if (table === 'user_stats') {
      const s = { select: vi.fn() };
      s.select.mockReturnValue({
        eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
      });
      return s;
    }

    if (table === 'generated_readings') {
      const s = { select: vi.fn() };
      s.select.mockReturnValue({
        eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
      });
      return s;
    }

    return { select: vi.fn(() => ({ data: [], error: null })) };
  });

  return {
    rpc,
    from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  } as never;
}

describe('getToday', () => {
  it('counts due and deck size via the scoped count RPC', async () => {
    const client = clientFor();

    const today = await getToday(client as never);

    expect((client as any).rpc).toHaveBeenNthCalledWith(1, 'count_deck_cards', {
      p_deck_id: null,
      p_due_only: false,
    });
    expect((client as any).rpc).toHaveBeenNthCalledWith(2, 'count_deck_cards', {
      p_deck_id: null,
      p_due_only: true,
    });
    expect(today.flashcards.due).toBe(3);
    expect(today.flashcards.deck_size).toBe(150);
    expect(today.flashcards.target).toBe(20);
  });
});