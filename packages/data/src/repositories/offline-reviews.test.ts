import { describe, expect, it, vi } from 'vitest';
import { emptyState } from '@hanyu/domain';
import type { HanyuClient } from '../client';
import { getCard, reviewCardEvent } from './flashcards';

const USER_ID = 'user-1';
const CARD_ID = 'card-1';
const REVIEW_ID = '00000000-0000-4000-8000-000000000001';
const REVIEWED_AT = '2026-07-30T08:00:00.000Z';

const cardRow = {
  id: CARD_ID,
  user_id: USER_ID,
  word_id: 42,
  version: 4,
  words: {
    id: 42,
    hanzi: '你好',
    pinyin: 'nǐ hǎo',
    meaning_en: 'hello',
    meaning_es: 'hola',
    hsk_level: 1,
    pos: null,
    frequency: 10,
  },
};

const schedulingRow = {
  skill: 'recognition',
  difficulty: 2.5,
  stability: 6,
  reps: 2,
  lapses: 0,
  learning_steps: 0,
  scheduled_days: 6,
  elapsed_days: 6,
  fsrs_state: 'review',
  next_review_at: '2026-08-05T08:00:00.000Z',
  last_reviewed_at: REVIEWED_AT,
  version: 4,
};

const reviewPrior = emptyState(new Date(REVIEWED_AT));
const reviewState = {
  ...reviewPrior,
  difficulty: 2.5,
  stability: 6,
  reps: 2,
  learning_steps: 0,
  scheduled_days: 6,
  elapsed_days: 6,
  state: 'review' as const,
  due: '2026-08-05T08:00:00.000Z',
  last_review: REVIEWED_AT,
};

const reviewEvent = {
  card_id: CARD_ID,
  grade: 3 as const,
  skill: 'recognition' as const,
  time_ms: 1200,
  review_id: REVIEW_ID,
  reviewed_at: REVIEWED_AT,
  expected_version: 3,
  state: reviewState,
  prior: reviewPrior,
};

function createQueryChain(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return query;
}

function createClient(options: {
  rpcResult?: { data: unknown; error: unknown };
  cardQueryResult?: { data: unknown; error: unknown };
  stateQueryResult?: { data: unknown; error: unknown };
}) {
  const cardQuery = createQueryChain(
    options.cardQueryResult ?? { data: cardRow, error: null },
  );
  const stateQuery = createQueryChain(
    options.stateQueryResult ?? { data: schedulingRow, error: null },
  );

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue(options.rpcResult ?? { data: null, error: null }),
    from: vi.fn((table: string) => {
      if (table === 'srs_cards') return cardQuery;
      if (table === 'learner_skill_state') return stateQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
    __cardQuery: cardQuery,
    __stateQuery: stateQuery,
  };
}

describe('reviewCardEvent', () => {
  it('calls apply_review with the calculated state and returns the authoritative card', async () => {
    const client = createClient({
      rpcResult: {
        data: [{ outcome: 'applied', version: 4 }],
        error: null,
      },
    });

    const result = await reviewCardEvent(reviewEvent, client as unknown as HanyuClient);

    expect(client.rpc).toHaveBeenCalledWith('apply_review', {
      p_card_id: CARD_ID,
      p_review_id: REVIEW_ID,
      p_reviewed_at: REVIEWED_AT,
      p_expected_version: 3,
      p_grade: 3,
      p_skill: 'recognition',
      p_state: reviewState,
      p_prior: reviewPrior,
      p_time_ms: 1200,
    });
    expect(result.outcome).toBe('applied');
    expect(result.card).toMatchObject({
      id: CARD_ID,
      user_id: USER_ID,
      word_id: 42,
      version: 4,
      skill: 'recognition',
      scheduling: reviewState,
      hanzi: '你好',
      pinyin: 'nǐ hǎo',
      meaning_en: 'hello',
    });
  });

  it('returns duplicate outcome with the authoritative card', async () => {
    const client = createClient({
      rpcResult: { data: { outcome: 'duplicate', version: 4 }, error: null },
    });

    const result = await reviewCardEvent(reviewEvent, client as unknown as HanyuClient);

    expect(result.outcome).toBe('duplicate');
    expect(result.card.id).toBe(CARD_ID);
    expect(result.card.version).toBe(4);
  });

  it('returns conflict outcome with the authoritative card', async () => {
    const client = createClient({
      rpcResult: { data: [{ outcome: 'conflict', version: 5 }], error: null },
    });

    const result = await reviewCardEvent(reviewEvent, client as unknown as HanyuClient);

    expect(result.outcome).toBe('conflict');
    expect(result.card.id).toBe(CARD_ID);
  });

  it('throws when the RPC response is empty', async () => {
    const client = createClient({ rpcResult: { data: [], error: null } });

    await expect(
      reviewCardEvent(reviewEvent, client as unknown as HanyuClient),
    ).rejects.toThrow(/No se pudo sincronizar el repaso/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('throws when the RPC response has an unknown outcome', async () => {
    const client = createClient({
      rpcResult: { data: [{ outcome: 'unexpected' }], error: null },
    });

    await expect(
      reviewCardEvent(reviewEvent, client as unknown as HanyuClient),
    ).rejects.toThrow(/No se pudo sincronizar el repaso/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('throws when the RPC call fails', async () => {
    const client = createClient({
      rpcResult: { data: null, error: { message: 'Authentication required' } },
    });

    await expect(
      reviewCardEvent(reviewEvent, client as unknown as HanyuClient),
    ).rejects.toThrow(/Authentication required/);
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('getCard', () => {
  it('returns a versioned card with the requested skill state', async () => {
    const client = createClient({});

    const card = await getCard(CARD_ID, client as unknown as HanyuClient);

    expect(client.from).toHaveBeenCalledWith('srs_cards');
    expect(client.from).toHaveBeenCalledWith('learner_skill_state');
    expect(client.__cardQuery.eq).toHaveBeenCalledWith('id', CARD_ID);
    expect(client.__cardQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(card).toMatchObject({
      id: CARD_ID,
      version: 4,
      hanzi: '你好',
      skill: 'recognition',
      scheduling: {
        difficulty: 2.5,
        stability: 6,
        reps: 2,
        lapses: 0,
        learning_steps: 0,
        scheduled_days: 6,
        elapsed_days: 6,
        state: 'review',
        due: '2026-08-05T08:00:00.000Z',
        last_review: REVIEWED_AT,
      },
    });
  });

  it('throws when the card is not found', async () => {
    const client = createClient({ cardQueryResult: { data: null, error: null } });

    await expect(getCard(CARD_ID, client as unknown as HanyuClient)).rejects.toThrow(
      /Card not found/,
    );
  });
});
