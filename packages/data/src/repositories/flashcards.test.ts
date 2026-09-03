import { describe, expect, it, vi } from 'vitest';
import { addCard, availableSkills, getDueCards, revertReview } from './flashcards';

function clientFor(options: { rpcRows?: unknown[]; wordRows?: unknown[]; deckSize?: number } = {}) {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: options.rpcRows ?? [], error: null })
    .mockResolvedValue({
      data: [{ deck_id: null, count: options.deckSize ?? 0 }],
      error: null,
    });

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

    if (table === 'words') {
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({ data: options.wordRows ?? [], error: null })),
        })),
      };
    }

    return { select: vi.fn(() => ({ data: [], error: null })) };
  });

  return {
    rpc,
    from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  } as never;
}

const revertCardRow = {
  id: 'card-1',
  user_id: 'u1',
  word_id: 7,
  version: 3,
};

const revertStateRow = {
  skill: 'recognition',
  difficulty: 2.5,
  stability: 1,
  reps: 0,
  lapses: 0,
  learning_steps: 0,
  scheduled_days: 0,
  elapsed_days: 0,
  fsrs_state: 'new',
  next_review_at: '2026-09-02T00:00:00.000Z',
  last_reviewed_at: null,
  version: 3,
};

function revertClient(outcome: string) {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ outcome, card_id: revertCardRow.id, version: revertCardRow.version }],
    error: null,
  });

  const from = vi.fn((table: string) => {
    if (table === 'srs_cards') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: revertCardRow, error: null }),
            })),
          })),
        })),
      };
    }

    if (table === 'learner_skill_state') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: revertStateRow, error: null }),
                })),
              })),
            })),
          })),
        })),
      };
    }

    return { select: vi.fn() };
  });

  return {
    rpc,
    from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  } as never;
}

describe('getDueCards', () => {
  it('maps the skill-state scheduling fields into one scheduling object', async () => {
    const client = clientFor({
      rpcRows: [
        {
          card_id: 'c-fsrs',
          user_id: 'u1',
          word_id: 5,
          skill: 'recognition',
          difficulty: 4.2,
          stability: 8.5,
          reps: 3,
          lapses: 1,
          learning_steps: 0,
          scheduled_days: 8,
          elapsed_days: 3,
          fsrs_state: 'review',
          next_review_at: '2026-09-02T09:00:00.000Z',
          last_reviewed_at: '2026-08-30T09:00:00.000Z',
          version: 4,
        },
      ],
      wordRows: [{ id: 5, hanzi: '你', pinyin: 'nǐ', meaning_en: 'you', hsk_level: 1 }],
      deckSize: 1,
    });

    const result = await getDueCards(50, client as never, null);

    expect(result.cards[0]).toMatchObject({
      id: 'c-fsrs',
      skill: 'recognition',
      version: 4,
      scheduling: {
        difficulty: 4.2,
        stability: 8.5,
        reps: 3,
        lapses: 1,
        learning_steps: 0,
        scheduled_days: 8,
        elapsed_days: 3,
        state: 'review',
        due: '2026-09-02T09:00:00.000Z',
        last_review: '2026-08-30T09:00:00.000Z',
      },
    });
  });

  it('calls get_due_cards RPC and maps bare srs rows using fetched words', async () => {
    const client = clientFor({
      rpcRows: [
        {
          card_id: 'c1',
          user_id: 'u1',
          word_id: 5,
          skill: 'recognition',
          difficulty: 0,
          stability: 0,
          reps: 0,
          lapses: 0,
          learning_steps: 0,
          scheduled_days: 0,
          elapsed_days: 0,
          fsrs_state: 'new',
          next_review_at: '2020-01-01T00:00:00Z',
          last_reviewed_at: null,
          version: 1,
        },
      ],
      wordRows: [{ id: 5, hanzi: '你', pinyin: 'nǐ', meaning_en: 'you', hsk_level: 1, pos: null, frequency: null }],
      deckSize: 2,
    });

    const result = await getDueCards(50, client as never, null);

    expect((client as any).rpc).toHaveBeenNthCalledWith(1, 'get_due_cards', {
      p_limit: 50,
      p_deck_id: null,
      p_skill: 'recognition',
    });
    expect((client as any).rpc).toHaveBeenNthCalledWith(2, 'count_deck_cards', {
      p_deck_id: null,
      p_due_only: false,
    });
    expect(result.cards[0].hanzi).toBe('你');
    expect(result.total).toBe(1);
    expect(result.deck_size).toBe(2);
  });

  it('passes the focused deck id to both RPCs', async () => {
    const client = clientFor({ rpcRows: [], deckSize: 2 });

    await getDueCards(20, client as never, 'd1');

    expect((client as any).rpc).toHaveBeenNthCalledWith(1, 'get_due_cards', {
      p_limit: 20,
      p_deck_id: 'd1',
      p_skill: 'recognition',
    });
    expect((client as any).rpc).toHaveBeenNthCalledWith(2, 'count_deck_cards', {
      p_deck_id: 'd1',
      p_due_only: false,
    });
  });

  it('passes the selected skill to the due-card RPC', async () => {
    const client = clientFor({ rpcRows: [], deckSize: 0 });

    await getDueCards(20, client as never, null, 'recall');

    expect((client as any).rpc).toHaveBeenNthCalledWith(1, 'get_due_cards', {
      p_limit: 20,
      p_deck_id: null,
      p_skill: 'recall',
    });
  });
});

describe('availableSkills', () => {
  it('siempre ofrece reconocimiento, recuerdo y escucha', () => {
    expect(availableSkills({ hasContext: false })).toEqual([
      'recognition',
      'recall',
      'listening',
    ]);
  });

  it('añade lectura en contexto solo cuando hay una frase guardada', () => {
    expect(availableSkills({ hasContext: true })).toContain('reading');
  });

  it('nunca ofrece producción: no hay evaluación de voz', () => {
    // Declararla sin poder evaluarla daría una tarjeta que el usuario no puede
    // aprobar nunca.
    expect(availableSkills({ hasContext: true })).not.toContain('production');
  });
});

describe('skill state initialization', () => {
  it('crea estados suspendidos para las habilidades derivadas', async () => {
    const rows: any[] = [];
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: vi.fn((table: string) => ({
        upsert: vi.fn((row: any) => {
          rows.push({ table, ...row });
          return { error: null };
        }),
      })),
    };

    await addCard(5, client as any, { deckId: 'd1' });

    expect(rows.filter((row) => row.table === 'learner_skill_state')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: 'recognition', suspended: false }),
        expect.objectContaining({ skill: 'recall', suspended: true }),
        expect.objectContaining({ skill: 'listening', suspended: true }),
      ]),
    );
  });
});

describe('revertReview', () => {
  it('returns the outcome and the refreshed card', async () => {
    const client = revertClient('reverted');

    const result = await revertReview('r1', client);

    expect((client as any).rpc).toHaveBeenCalledWith('revert_review', { p_review_id: 'r1' });
    expect(result.outcome).toBe('reverted');
    expect(result.card).not.toBeNull();
    expect(result.card?.id).toBe('card-1');
  });

  it('surfaces a conflict without pretending it worked', async () => {
    const result = await revertReview('r1', revertClient('conflict'));

    expect(result.outcome).toBe('conflict');
  });

  it('returns not_found without querying a card for an RPC result with no card', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ outcome: 'not_found', card_id: null, version: null }],
        error: null,
      }),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: vi.fn(() => {
        throw new Error('not_found must not load a card');
      }),
    } as never;

    await expect(revertReview('missing-review', client)).resolves.toEqual({
      outcome: 'not_found',
      card: null,
    });
    expect((client as any).from).not.toHaveBeenCalled();
  });
});

describe('addCard', () => {
  it('guarda el contexto de lectura una sola vez por frase', async () => {
    const upserts: Array<{ table: string; row: any; options?: any }> = [];
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: vi.fn((table: string) => ({
        upsert: vi.fn((row: any, options?: any) => {
          upserts.push({ table, row, options });
          return { error: null };
        }),
      })),
    };

    await addCard(5, client as any, {
      deckId: 'd1',
      context: {
        sentence: '我明天还你钱。',
        source_kind: 'reading',
        source_id: 'reading-1',
      },
    });

    expect(upserts.find((entry) => entry.table === 'word_context')).toEqual({
      table: 'word_context',
      row: {
        user_id: 'u1',
        word_id: 5,
        sentence: '我明天还你钱。',
        source_kind: 'reading',
        source_id: 'reading-1',
      },
      options: { onConflict: 'user_id,word_id,sentence', ignoreDuplicates: true },
    });
  });

  it('inserts deck membership for the target deck and ensures the srs card', async () => {
    const inserts: Array<{ table: string; row: any; options?: any }> = [];
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: vi.fn((table: string) => {
        const record = { table, row: undefined as any, options: undefined as any };
        inserts.push(record);
        return {
          upsert: vi.fn((row: any, options?: Record<string, unknown>) => {
            record.row = row;
            record.options = options;
            return { error: null };
          }),
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
        };
      }),
    };

    const result = await addCard(5, client as any, { deckId: 'd1' });

    const deckCard = inserts.find((i) => i.table === 'deck_cards');
    const srs = inserts.find((i) => i.table === 'srs_cards');

    expect(srs?.row.word_id).toBe(5);
    expect(srs?.options).toEqual({ onConflict: 'user_id,word_id', ignoreDuplicates: true });
    expect(deckCard?.row).toEqual({ deck_id: 'd1', word_id: 5 });
    expect(result).toEqual({ word_id: 5, deck_id: 'd1' });
  });

  it('resolves the default deck when no deck id is given', async () => {
    const inserts: Array<{ table: string; row: any }> = [];
    let deckLookups = 0;
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === 'decks' && deckLookups === 0) {
          deckLookups += 1;
          return {
            upsert: vi.fn(() => ({ error: null })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'd-default' }, error: null }) })),
              })),
            })),
          };
        }
        const record = { table, row: undefined as any };
        inserts.push(record);
        record.row = null;
        return {
          upsert: vi.fn((row: any) => {
            record.row = row;
            return { error: null };
          }),
        };
      }),
    };

    const result = await addCard(7, client as any);

    const deckCard = inserts.find((i) => i.table === 'deck_cards');
    expect(deckCard?.row).toEqual({ deck_id: 'd-default', word_id: 7 });
    expect(result).toEqual({ word_id: 7, deck_id: 'd-default' });
  });
});
