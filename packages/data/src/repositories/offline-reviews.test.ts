import { describe, expect, it, vi } from 'vitest';
import type { HanyuClient } from '../client';
import { getCard, reviewCardEvent } from './flashcards';

const USER_ID = 'user-1';
const CARD_ID = 'card-1';

const cardRow = {
  id: CARD_ID,
  user_id: USER_ID,
  word_id: 42,
  ease_factor: 2.5,
  interval_days: 6,
  repetitions: 2,
  next_review_at: '2026-08-05T08:00:00.000Z',
  last_reviewed_at: '2026-07-30T08:00:00.000Z',
  status: 'review',
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

const reviewEvent = {
  card_id: CARD_ID,
  quality: 4,
  time_ms: 1200,
  review_id: '00000000-0000-4000-8000-000000000001',
  reviewed_at: '2026-07-30T08:00:00.000Z',
  expected_version: 3,
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
}) {
  const cardQuery = createQueryChain(
    options.cardQueryResult ?? { data: cardRow, error: null }
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
      if (table === 'srs_cards') {
        return cardQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    __cardQuery: cardQuery,
  };
}

describe('reviewCardEvent', () => {
  it('calls the six-argument review_flashcard RPC and returns applied with the authoritative card', async () => {
    const client = createClient({
      rpcResult: {
        data: [
          {
            outcome: 'applied',
            interval: 6,
            next_review: '2026-08-05T08:00:00.000Z',
            ease_factor: 2.5,
            repetitions: 2,
            status: 'review',
            version: 4,
            last_reviewed_at: '2026-07-30T08:00:00.000Z',
          },
        ],
        error: null,
      },
    });

    const result = await reviewCardEvent(reviewEvent, client as unknown as HanyuClient);

    expect(client.rpc).toHaveBeenCalledWith('review_flashcard', {
      card_id: CARD_ID,
      quality: 4,
      time_ms: 1200,
      review_id: expect.any(String),
      reviewed_at: '2026-07-30T08:00:00.000Z',
      expected_version: 3,
    });
    expect(result.outcome).toBe('applied');
    expect(result.card).toMatchObject({
      id: CARD_ID,
      user_id: USER_ID,
      word_id: 42,
      version: 4,
      hanzi: '你好',
      pinyin: 'nǐ hǎo',
      meaning_en: 'hello',
      repetitions: 2,
      interval_days: 6,
      ease_factor: 2.5,
      next_review_at: '2026-08-05T08:00:00.000Z',
      last_reviewed_at: '2026-07-30T08:00:00.000Z',
      status: 'review',
    });
    expect(client.from).toHaveBeenCalledWith('srs_cards');
    expect(client.__cardQuery.eq).toHaveBeenCalledWith('id', CARD_ID);
    expect(client.__cardQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
  });

  it('returns duplicate outcome with the authoritative card', async () => {
    const client = createClient({
      rpcResult: {
        data: {
          outcome: 'duplicate',
          interval: 6,
          next_review: '2026-08-05T08:00:00.000Z',
          ease_factor: 2.5,
          repetitions: 2,
          status: 'review',
          version: 4,
          last_reviewed_at: '2026-07-30T08:00:00.000Z',
        },
        error: null,
      },
    });

    const result = await reviewCardEvent(reviewEvent, client as unknown as HanyuClient);

    expect(result.outcome).toBe('duplicate');
    expect(result.card.id).toBe(CARD_ID);
    expect(result.card.version).toBe(4);
    expect(client.from).toHaveBeenCalledWith('srs_cards');
  });

  it('returns conflict outcome with the authoritative card', async () => {
    const client = createClient({
      rpcResult: {
        data: [
          {
            outcome: 'conflict',
            interval: 1,
            next_review: '2026-07-31T08:00:00.000Z',
            ease_factor: 2.3,
            repetitions: 1,
            status: 'learning',
            version: 5,
            last_reviewed_at: '2026-07-29T08:00:00.000Z',
          },
        ],
        error: null,
      },
    });

    const result = await reviewCardEvent(reviewEvent, client as unknown as HanyuClient);

    expect(result.outcome).toBe('conflict');
    expect(result.card.id).toBe(CARD_ID);
    expect(client.from).toHaveBeenCalledWith('srs_cards');
  });

  it('throws when the RPC response is empty', async () => {
    const client = createClient({
      rpcResult: { data: [], error: null },
    });

    await expect(
      reviewCardEvent(reviewEvent, client as unknown as HanyuClient)
    ).rejects.toThrow(/Failed to sync review/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('throws when the RPC response has an unknown outcome', async () => {
    const client = createClient({
      rpcResult: {
        data: [{ outcome: 'unexpected' }],
        error: null,
      },
    });

    await expect(
      reviewCardEvent(reviewEvent, client as unknown as HanyuClient)
    ).rejects.toThrow(/Failed to sync review/);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('throws when the RPC call fails', async () => {
    const client = createClient({
      rpcResult: {
        data: null,
        error: { message: 'Authentication required' },
      },
    });

    await expect(
      reviewCardEvent(reviewEvent, client as unknown as HanyuClient)
    ).rejects.toThrow(/Authentication required/);
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('getCard', () => {
  it('returns a versioned card scoped to the authenticated user', async () => {
    const client = createClient({});

    const card = await getCard(CARD_ID, client as unknown as HanyuClient);

    expect(client.from).toHaveBeenCalledWith('srs_cards');
    expect(client.__cardQuery.eq).toHaveBeenCalledWith('id', CARD_ID);
    expect(client.__cardQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(card).toMatchObject({
      id: CARD_ID,
      version: 4,
      hanzi: '你好',
      repetitions: 2,
      interval_days: 6,
    });
  });

  it('throws when the card is not found', async () => {
    const client = createClient({
      cardQueryResult: { data: null, error: null },
    });

    await expect(getCard(CARD_ID, client as unknown as HanyuClient)).rejects.toThrow(
      /Card not found/
    );
  });
});
