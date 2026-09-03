import { describe, expect, it, vi } from 'vitest';
import {
  clearLeech,
  getLeechStates,
  getSkillStates,
  setSkillSuspended,
  upsertSkillState,
} from './skills';

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
    from: vi.fn((table: string) => {
      chains[table] = chains[table] ?? queryChain(perTable[table] ?? { data: null, error: null });
      return chains[table];
    }),
    chains,
  } as any;
}

const stateRow = {
  id: 's1',
  user_id: 'u1',
  target_kind: 'word',
  target_id: 42,
  skill: 'recognition',
  difficulty: 2.5,
  stability: 6,
  reps: 3,
  lapses: 0,
  last_reviewed_at: '2026-09-01T10:00:00.000Z',
  next_review_at: '2026-09-07T10:00:00.000Z',
  suspended: false,
  auto_suspended: false,
  version: 2,
};

describe('skills repository', () => {
  it('getSkillStates asks only for the requested targets', async () => {
    const client = clientFor({ learner_skill_state: { data: [stateRow], error: null } });

    const states = await getSkillStates({ target_kind: 'word', target_ids: [42, 43] }, client);

    expect(states).toHaveLength(1);
    expect(client.chains.learner_skill_state.in).toHaveBeenCalledWith('target_id', [42, 43]);
  });

  it('getSkillStates returns an empty list without querying when there are no targets', async () => {
    const client = clientFor({});

    const states = await getSkillStates({ target_kind: 'word', target_ids: [] }, client);

    expect(states).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('upsertSkillState keys on user, target and skill', async () => {
    const client = clientFor({ learner_skill_state: { data: stateRow, error: null } });

    await upsertSkillState(
      { target_kind: 'word', target_id: 42, skill: 'listening', stability: 1 },
      client,
    );

    expect(client.chains.learner_skill_state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', target_id: 42, skill: 'listening' }),
      { onConflict: 'user_id,target_kind,target_id,skill' },
    );
  });

  it('getLeechStates enriches numeric targets with the word users can recognize', async () => {
    const client = clientFor({
      learner_skill_state: { data: [{ ...stateRow, leech: true }], error: null },
      words: { data: [{ id: 42, hanzi: '学', pinyin: 'xué', meaning_es: 'estudiar', meaning_en: 'to study' }], error: null },
    });

    const states = await getLeechStates('recognition', client);

    expect(states[0].word).toEqual({
      hanzi: '学',
      pinyin: 'xué',
      meaning_es: 'estudiar',
      meaning_en: 'to study',
    });
    expect(client.chains.words.in).toHaveBeenCalledWith('id', [42]);
  });

  it('marks a manual suspension as user-owned', async () => {
    const client = clientFor({ learner_skill_state: { data: stateRow, error: null } });

    await setSkillSuspended(
      { target_kind: 'word', target_id: 42, skill: 'recall', suspended: true },
      client,
    );

    expect(client.chains.learner_skill_state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ suspended: true, auto_suspended: false }),
      { onConflict: 'user_id,target_kind,target_id,skill' },
    );
  });

  it('clears the leech flag and its automatic suspension together', async () => {
    const client = clientFor({ learner_skill_state: { data: stateRow, error: null } });

    await clearLeech(
      { target_kind: 'word', target_id: 42, skill: 'recognition' },
      client,
    );

    expect(client.chains.learner_skill_state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        leech: false,
        suspended: false,
        auto_suspended: false,
        lapses: 0,
      }),
    );
  });
});
