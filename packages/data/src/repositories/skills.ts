//
// Un estado por (usuario, objetivo, habilidad). El Plan 4 sustituirá SM-2 por
// FSRS sobre esta tabla; aquí solo se lee y se escribe.
import type { HanyuClient } from '../client';
import type { LearnerSkillState, LearningSkill, LearningTargetKind } from '../types';
import { createRepositoryError, getRequiredUserId } from './shared';

const COLUMNS =
  'id, user_id, target_kind, target_id, skill, difficulty, stability, retrievability, reps, lapses, last_reviewed_at, next_review_at, suspended, version';

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
  retrievability?: number | null;
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

  const { data, error } = await client
    .from('learner_skill_state')
    .upsert(
      { user_id: userId, updated_at: new Date().toISOString(), ...input } as any,
      { onConflict: 'user_id,target_kind,target_id,skill' },
    )
    .select(COLUMNS)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to save skill state');
  }

  return data as unknown as LearnerSkillState;
}
