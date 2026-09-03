//
// Un estado por (usuario, objetivo, habilidad), gobernado por FSRS.
import type { HanyuClient } from '../client';
import type { LearnerSkillState, LearningSkill, LearningTargetKind } from '../types';
import { createRepositoryError, getRequiredUserId } from './shared';

const COLUMNS =
  'id, user_id, target_kind, target_id, skill, difficulty, stability, fsrs_state, learning_steps, scheduled_days, elapsed_days, reps, lapses, last_reviewed_at, next_review_at, suspended, auto_suspended, leech, version';

export interface GetSkillStatesInput {
  target_kind: LearningTargetKind;
  target_ids: number[];
  skill?: LearningSkill;
}

export async function getSkillStates(
  params: GetSkillStatesInput,
  client: HanyuClient,
): Promise<LearnerSkillState[]> {
  if (params.target_ids.length === 0) {
    return [];
  }

  const userId = await getRequiredUserId(client);

  let query = client
    .from('learner_skill_state')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('target_kind', params.target_kind)
    .in('target_id', params.target_ids);

  if (params.skill) {
    query = query.eq('skill', params.skill);
  }

  const { data, error } = await query;

  if (error) {
    throw createRepositoryError(error, 'Failed to load skill states');
  }

  return (data ?? []) as unknown as LearnerSkillState[];
}

export interface UpsertSkillStateInput {
  target_kind: LearningTargetKind;
  target_id: number;
  skill: LearningSkill;
  difficulty?: number | null;
  stability?: number | null;
  reps?: number;
  lapses?: number;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  suspended?: boolean;
}

export async function upsertSkillState(
  input: UpsertSkillStateInput,
  client: HanyuClient,
): Promise<LearnerSkillState> {
  const userId = await getRequiredUserId(client);

  const { data, error } = await (client
    .from('learner_skill_state') as any)
    .upsert(
      {
        user_id: userId,
        updated_at: new Date().toISOString(),
        ...input,
        ...(input.suspended === undefined ? {} : { auto_suspended: false }),
      } as any,
      { onConflict: 'user_id,target_kind,target_id,skill' },
    )
    .select(COLUMNS)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to save skill state');
  }

  return data as unknown as LearnerSkillState;
}

export async function getLeechStates(
  skill: LearningSkill = 'recognition',
  client: HanyuClient,
): Promise<LearnerSkillState[]> {
  const userId = await getRequiredUserId(client);
  const { data, error } = await client
    .from('learner_skill_state')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('target_kind', 'word')
    .eq('skill', skill)
    .eq('leech', true)
    .order('lapses', { ascending: false });

  if (error) {
    throw createRepositoryError(error, 'Failed to load leeches');
  }

  const states = (data ?? []) as unknown as LearnerSkillState[];
  const wordIds = [...new Set(states.map((state) => state.target_id))];
  if (wordIds.length === 0) {
    return states;
  }

  const { data: words, error: wordsError } = await client
    .from('words')
    .select('id, hanzi, pinyin, meaning_es, meaning_en')
    .in('id', wordIds);

  if (wordsError) {
    throw createRepositoryError(wordsError, 'Failed to load leech words');
  }

  const wordsById = new Map(
    (words ?? []).map((word: any) => [Number(word.id), {
      hanzi: String(word.hanzi),
      pinyin: String(word.pinyin),
      meaning_es: word.meaning_es ?? null,
      meaning_en: String(word.meaning_en),
    }]),
  );

  return states.map((state) => ({ ...state, word: wordsById.get(state.target_id) }));
}

export async function setSkillSuspended(
  input: Pick<UpsertSkillStateInput, 'target_kind' | 'target_id' | 'skill'> & { suspended: boolean },
  client: HanyuClient,
): Promise<LearnerSkillState> {
  return upsertSkillState(input, client);
}

export async function clearLeech(
  input: Pick<UpsertSkillStateInput, 'target_kind' | 'target_id' | 'skill'>,
  client: HanyuClient,
): Promise<LearnerSkillState> {
  const userId = await getRequiredUserId(client);
  const { data, error } = await client
    .from('learner_skill_state')
    .update({
      leech: false,
      suspended: false,
      auto_suspended: false,
      // Lapses are the evidence used by apply_review to derive leech. Reset
      // the counter so future lapses, rather than historical ones, can cross
      // the attention threshold again.
      lapses: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('target_kind', input.target_kind)
    .eq('target_id', input.target_id)
    .eq('skill', input.skill)
    .select(COLUMNS)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to clear leech');
  }

  return data as unknown as LearnerSkillState;
}
