import { describe, expect, it, vi } from 'vitest';
import {
  addDeckFromTemplate,
  addWordToDeck,
  createDeck,
  deleteDeck,
  getDeckCards,
  getDecks,
  getDeckTemplates,
  removeWordFromDeck,
  updateDeck,
} from './decks';

const user = { id: 'u1' };

function auth() {
  return { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) };
}

function queryChain(result: Record<string, unknown>) {
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'in',
    'lte',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ];

  const chain: Record<string, any> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

function clientFor(perTable: Record<string, Record<string, unknown>>) {
  return {
    auth: auth(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn((table: string) => queryChain(perTable[table] ?? { data: null, error: null })),
  } as any;
}

const deckRow = {
  id: 'd1',
  user_id: 'u1',
  name: 'Travel',
  description: null,
  is_active: true,
  is_default: false,
  source_template_id: null,
  sort_order: 0,
};

describe('decks repository', () => {
  it('createDeck inserts and returns the created deck', async () => {
    const client = clientFor({ decks: { data: deckRow, error: null } });

    const deck = await createDeck({ name: 'Travel' }, client);

    expect(deck.id).toBe('d1');
    expect(deck.name).toBe('Travel');
    expect(client.from).toHaveBeenCalledWith('decks');
  });

  it('updateDeck patches the deck row', async () => {
    const client = clientFor({ decks: { data: { ...deckRow, is_active: false }, error: null } });

    const deck = await updateDeck('d1', { is_active: false }, client);

    expect(deck.is_active).toBe(false);
    const calls = client.from.mock.calls.filter((args: unknown[]) => args[0] === 'decks');
    expect(calls.length).toBeGreaterThan(0);
  });

  it('deleteDeck removes the owned deck', async () => {
    const client = clientFor({ decks: { data: null, error: null } });

    const result = await deleteDeck('d1', client);

    expect(result).toEqual({ id: 'd1' });
  });

  it('addWordToDeck upserts membership without throwing on duplicate', async () => {
    const client = clientFor({ deck_cards: { data: null, error: null } });

    const res = await addWordToDeck('d1', 5, client);

    expect(res).toEqual({ deck_id: 'd1', word_id: 5 });
    const fromCalls = client.from.mock.calls.map((c: unknown[]) => c[0]);
    expect(fromCalls).toContain('deck_cards');
    expect(fromCalls).toContain('srs_cards');
  });

  it('removeWordFromDeck deletes the membership row', async () => {
    const client = clientFor({ deck_cards: { data: null, error: null } });

    const res = await removeWordFromDeck('d1', 5, client);

    expect(res).toEqual({ deck_id: 'd1', word_id: 5 });
  });

  it('getDeckTemplates returns the catalog rows', async () => {
    const client = clientFor({
      deck_templates: {
        data: [
          {
            id: 't1',
            slug: 'hsk1',
            name: 'HSK 1',
            description: 'Foundation',
            category: 'hsk',
            hsk_level: 1,
            sort_order: 10,
          },
        ],
        error: null,
      },
    });

    const templates = await getDeckTemplates(client);

    expect(templates).toHaveLength(1);
    expect(templates[0].slug).toBe('hsk1');
  });

  it('getDecks returns deck summaries with counts from the stats RPC', async () => {
    const client = clientFor({ decks: { data: [deckRow], error: null } });
    client.rpc.mockResolvedValue({
      data: [{ deck_id: 'd1', word_count: 2, due_count: 1 }],
      error: null,
    });

    const decks = await getDecks(client);

    expect(client.rpc).toHaveBeenCalledWith('get_deck_stats', {});
    expect(decks).toHaveLength(1);
    expect(decks[0].word_count).toBe(2);
    expect(decks[0].due_count).toBe(1);
  });

  it('getDecks falls back to client-side counting when the stats RPC is unavailable', async () => {
    const client = clientFor({
      decks: { data: [deckRow], error: null },
      deck_cards: { data: [{ deck_id: 'd1', word_id: 5 }, { deck_id: 'd1', word_id: 6 }], error: null },
      srs_cards: {
        data: [
          { word_id: 5, next_review_at: '2020-01-01T00:00:00.000Z' },
          { word_id: 7, next_review_at: '2020-01-01T00:00:00.000Z' },
        ],
        error: null,
      },
    });
    client.rpc.mockResolvedValue({ data: null, error: { message: 'PGRST202 not found' } });

    const decks = await getDecks(client);

    expect(decks).toHaveLength(1);
    expect(decks[0].word_count).toBe(2);
    expect(decks[0].due_count).toBe(1);
  });

  it('getDecks returns an empty array when the user has no decks', async () => {
    const client = clientFor({ decks: { data: [], error: null } });

    const decks = await getDecks(client);

    expect(decks).toEqual([]);
  });

  it('addDeckFromTemplate calls the RPC and returns the deck id', async () => {
    const client = clientFor({});
    client.rpc.mockResolvedValue({
      data: [{ deck_id: 'd9', inserted: 150 }],
      error: null,
    });

    const result = await addDeckFromTemplate('t9', client);

    expect(client.rpc).toHaveBeenCalledWith('add_deck_from_template', { p_template_id: 't9' });
    expect(result).toEqual({ deck_id: 'd9', inserted: 150 });
  });

  it('getDeckCards maps membership rows with word details', async () => {
    const client = clientFor({
      deck_cards: {
        data: [
          {
            word_id: 5,
            words: { id: 5, hanzi: '你好', pinyin: 'nǐ hǎo', meaning_en: 'hello', hsk_level: 1 },
          },
        ],
        error: null,
      },
    });

    const cards = await getDeckCards('d1', client);

    expect(cards).toEqual([
      { word_id: 5, hanzi: '你好', pinyin: 'nǐ hǎo', meaning_en: 'hello', hsk_level: 1 },
    ]);
  });
});