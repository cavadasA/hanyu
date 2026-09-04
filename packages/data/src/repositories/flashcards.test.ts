import { describe, expect, it, vi } from 'vitest';
import {
  addCard,
  buildQueue,
  createStudyPlan,
  getCard,
  reviewCardEvent,
  revertReview,
  submitDiagnostic,
} from './flashcards';

function queueRow(cardId: string, isNew: boolean) {
  return {
    card_id: cardId,
    user_id: 'u1',
    word_id: 1,
    skill: 'recognition',
    is_new: isNew,
    difficulty: 5,
    stability: 10,
    reps: 2,
    lapses: 0,
    learning_steps: 0,
    scheduled_days: 3,
    elapsed_days: 3,
    fsrs_state: isNew ? 'new' : 'review',
    next_review_at: '2026-09-02T00:00:00.000Z',
    last_reviewed_at: '2026-08-30T00:00:00.000Z',
    version: 1,
  };
}

function queueClient(rows: unknown[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({
          data: [{ id: 1, hanzi: '你好', pinyin: 'nǐ hǎo', meaning_es: 'hola', hsk_level: 1 }],
          error: null,
        }),
      })),
    })),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  } as never;
}

describe('buildQueue', () => {
  it('pide la cola al servidor y no recorta el resultado', async () => {
    const client = queueClient([queueRow('c1', false), queueRow('c2', true)]);

    const queue = await buildQueue({ skill: 'recognition' }, client);

    expect((client as any).rpc).toHaveBeenCalledWith('build_review_queue', {
      p_deck_id: null,
      p_skill: 'recognition',
      p_limit: null,
    });
    expect(queue.cards).toHaveLength(2);
    expect(queue.cards[0].user_id).toBe('u1');
  });

  it('distingue las tarjetas nuevas de los repasos', async () => {
    const client = queueClient([queueRow('c1', false), queueRow('c2', true)]);

    const queue = await buildQueue({ skill: 'recognition' }, client);

    expect(queue.cards.map((card) => card.is_new)).toEqual([false, true]);
  });

  it('devuelve una cola vacía sin reventar cuando no hay nada que estudiar', async () => {
    const queue = await buildQueue({ skill: 'recognition' }, queueClient([]));

    expect(queue.cards).toEqual([]);
  });

  it('devuelve el tamaño real del mazo enfocado aunque la cola esté vacía', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ deck_id: 'd1', count: 7 }], error: null });
    const client = queueClient([]) as any;
    client.rpc = rpc;

    const queue = await buildQueue({ skill: 'recognition', deckId: 'd1' }, client);

    expect(queue).toEqual({ cards: [], deck_size: 7 });
  });
});

describe('study plan and diagnostic', () => {
  it('crea el plan completo para los niveles elegidos', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ deck_id: 'd1', scope_size: 504 }],
        error: null,
      }),
    };

    await expect(createStudyPlan([1, 2], client as never)).resolves.toEqual({
      deck_id: 'd1',
      scope_size: 504,
    });
    expect(client.rpc).toHaveBeenCalledWith('create_study_plan', { p_levels: [1, 2] });
  });

  it('guarda las respuestas del diagnóstico y devuelve sus conteos', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ suspended: 1, queued: 1 }],
        error: null,
      }),
    };
    const results = [
      { word_id: 1, known: true },
      { word_id: 2, known: false },
    ];

    await expect(submitDiagnostic(results, client as never)).resolves.toEqual({
      suspended: 1,
      queued: 1,
    });
    expect(client.rpc).toHaveBeenCalledWith('submit_diagnostic', { p_results: results });
  });
});

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

function cardClient(skill: 'recognition' | 'recall' | 'listening' = 'recall') {
  const makeChain = (data: unknown) => {
    const chain: any = {
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    };
    return chain;
  };

  const cardRow = {
    id: 'card-1',
    user_id: 'u1',
    word_id: 7,
    version: 4,
    words: { id: 7, hanzi: '学', pinyin: 'xué', meaning_en: 'study' },
  };
  const stateRow = {
    skill,
    difficulty: 4.2,
    stability: 8.5,
    reps: 3,
    lapses: 1,
    learning_steps: 0,
    scheduled_days: 8,
    elapsed_days: 3,
    fsrs_state: 'review',
    next_review_at: '2026-09-04T09:00:00.000Z',
    last_reviewed_at: '2026-08-30T09:00:00.000Z',
    version: 4,
  };
  const cardQuery = makeChain(cardRow);
  const stateQuery = makeChain(stateRow);
  const from = vi.fn((table: string) =>
    table === 'srs_cards'
      ? { select: vi.fn(() => cardQuery) }
      : { select: vi.fn(() => stateQuery) },
  );

  return {
    rpc: vi.fn().mockResolvedValue({
      data: [{ outcome: 'applied', card_id: 'card-1', version: 5 }],
      error: null,
    }),
    from,
    cardQuery,
    stateQuery,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  } as never;
}

describe('getCard y reviewCardEvent', () => {
  it('carga el estado de la habilidad solicitada', async () => {
    const client = cardClient('recall') as any;

    const card = await getCard('card-1', client, 'recall');

    expect(card.skill).toBe('recall');
    expect(client.stateQuery.eq).toHaveBeenCalledWith('skill', 'recall');
  });

  it('conserva time_ms y recarga la misma habilidad después de sincronizar', async () => {
    const client = cardClient('listening') as any;
    const event = {
      card_id: 'card-1',
      grade: 3 as const,
      skill: 'listening' as const,
      time_ms: 3200,
      review_id: 'review-1',
      reviewed_at: '2026-09-03T10:00:00.000Z',
      expected_version: 4,
      state: {
        difficulty: 4.2,
        stability: 8.5,
        reps: 4,
        lapses: 1,
        learning_steps: 0,
        scheduled_days: 8,
        elapsed_days: 3,
        state: 'review' as const,
        due: '2026-09-04T09:00:00.000Z',
        last_review: '2026-09-03T10:00:00.000Z',
      },
      prior: {
        difficulty: 4.2,
        stability: 8.5,
        reps: 3,
        lapses: 1,
        learning_steps: 0,
        scheduled_days: 8,
        elapsed_days: 3,
        state: 'review' as const,
        due: '2026-09-03T09:00:00.000Z',
        last_review: '2026-08-30T09:00:00.000Z',
      },
    };

    const result = await reviewCardEvent(event, client);

    expect(client.rpc).toHaveBeenCalledWith('apply_review', expect.objectContaining({
      p_time_ms: 3200,
      p_skill: 'listening',
    }));
    expect(result.card.skill).toBe('listening');
    expect(client.stateQuery.eq).toHaveBeenCalledWith('skill', 'listening');
  });
});

describe('skill state initialization', () => {
  it('delega los estados de habilidad en los triggers de la base', async () => {
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

    expect(rows.filter((row) => row.table === 'learner_skill_state')).toHaveLength(0);
    expect(rows.filter((row) => row.table === 'srs_cards')).toHaveLength(1);
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
