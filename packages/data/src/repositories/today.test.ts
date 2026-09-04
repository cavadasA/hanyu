import { describe, expect, it, vi } from 'vitest';
import { getToday } from './today';

function clientFor(options: { settings?: Record<string, unknown>; reading?: unknown } = {}) {
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
            data: {
              user_id: 'u1',
              review_limit_per_day: 200,
              session_size: 20,
              card_order: 'due',
              new_cards_per_day: 20,
              current_level: 2,
              theme: 'light',
              ...options.settings,
            },
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

    if (table === 'reading') {
      const s = { select: vi.fn() };
      const readingQuery: any = {
        eq: vi.fn(() => readingQuery),
        order: vi.fn(() => readingQuery),
        limit: vi.fn(() => readingQuery),
        maybeSingle: vi.fn().mockResolvedValue({ data: options.reading ?? null, error: null }),
      };
      s.select.mockReturnValue(readingQuery);
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
    expect(today.flashcards.new_target).toBe(20);
    expect(today.flashcards.review_target).toBe(200);
  });

  it('no fuerza el nivel del usuario a 2', async () => {
    const today = await getToday(clientFor({ settings: { current_level: 1 } }));

    expect(today.profile.current_level).toBe(1);
  });

  it('no afirma un modo de estudio que nadie ha elegido', async () => {
    const today = await getToday(clientFor({ settings: { current_level: 2 } }));

    expect(today.profile).not.toHaveProperty('mode');
  });

  it('la meta de tarjetas nuevas sale de los ajustes', async () => {
    const today = await getToday(clientFor({ settings: { new_cards_per_day: 15 } }));

    expect(today.flashcards.new_target).toBe(15);
  });

  it('lee la próxima lectura del catálogo reading', async () => {
    const reading = { slug: 'reading-1', title: 'Una lectura', hsk_level: 2, format: 'short_text' };
    const client = clientFor({ reading });

    const today = await getToday(client as never);

    expect(today.reading.next).toEqual(reading);
    expect((client as any).from).toHaveBeenCalledWith('reading');
  });
});
