import { describe, expect, it, vi } from 'vitest';
import { getEvents, recordEvent } from './events';

const user = { id: 'u1' };

function auth() {
  return { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) };
}

function queryChain(result: Record<string, unknown>) {
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'in', 'gte', 'lte', 'order', 'limit', 'single', 'maybeSingle',
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
  const chains: Record<string, any> = {};
  return {
    auth: auth(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn((table: string) => {
      chains[table] = chains[table] ?? queryChain(perTable[table] ?? { data: null, error: null });
      return chains[table];
    }),
    chains,
  } as any;
}

const eventRow = {
  id: 'e1',
  user_id: 'u1',
  occurred_at: '2026-09-02T10:00:00.000Z',
  recorded_at: '2026-09-02T10:00:01.000Z',
  kind: 'review_rated',
  target_kind: 'word',
  target_id: 42,
  skill: 'recognition',
  payload: { quality: 4, time_ms: 3200 },
  client_event_id: 'c1',
  reverts_event_id: null,
};

describe('events repository', () => {
  it('recordEvent stamps the current user and returns the stored event', async () => {
    const client = clientFor({ learning_event: { data: eventRow, error: null } });

    const event = await recordEvent(
      {
        kind: 'review_rated',
        target_kind: 'word',
        target_id: 42,
        skill: 'recognition',
        payload: { quality: 4, time_ms: 3200 },
        client_event_id: 'c1',
        occurred_at: '2026-09-02T10:00:00.000Z',
      },
      client,
    );

    expect(event.id).toBe('e1');
    expect(client.chains.learning_event.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', kind: 'review_rated', target_id: 42 }),
    );
  });

  it('recordEvent rejects a target id without a target kind', async () => {
    const client = clientFor({});

    await expect(
      recordEvent({ kind: 'word_looked_up', target_id: 42 } as never, client),
    ).rejects.toThrow(/target_kind/);
  });

  it('recordEvent rejects a revert that does not name the event it reverts', async () => {
    const client = clientFor({});

    await expect(
      recordEvent({ kind: 'review_reverted', target_kind: 'word', target_id: 42 }, client),
    ).rejects.toThrow(/reverts_event_id/);
  });

  it('getEvents filters by target and returns newest first', async () => {
    const client = clientFor({ learning_event: { data: [eventRow], error: null } });

    const events = await getEvents({ target_kind: 'word', target_id: 42, limit: 10 }, client);

    expect(events).toHaveLength(1);
    expect(client.chains.learning_event.order).toHaveBeenCalledWith('occurred_at', {
      ascending: false,
    });
  });
});
