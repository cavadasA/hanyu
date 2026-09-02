//
// El registro de aprendizaje es append-only: nunca se actualiza ni se borra
// una fila. Deshacer una valoración no es borrar lo que pasó —la escritura ya
// se propagó a srs_cards y user_stats— sino registrar que aquello no cuenta,
// para poder recalcular el estado desde el historial válido.
import type { HanyuClient } from '../client';
import type {
  LearningEvent,
  LearningEventKind,
  LearningSkill,
  LearningTargetKind,
} from '../types';
import { createRepositoryError, getRequiredUserId } from './shared';

const COLUMNS =
  'id, user_id, occurred_at, recorded_at, kind, target_kind, target_id, skill, payload, client_event_id, reverts_event_id';

export interface RecordEventInput {
  kind: LearningEventKind;
  target_kind?: LearningTargetKind;
  target_id?: number;
  skill?: LearningSkill;
  payload?: Record<string, unknown>;
  client_event_id?: string;
  occurred_at?: string;
  reverts_event_id?: string;
}

export async function recordEvent(
  input: RecordEventInput,
  client: HanyuClient,
): Promise<LearningEvent> {
  const hasKind = input.target_kind !== undefined;
  const hasId = input.target_id !== undefined;
  if (hasKind !== hasId) {
    throw new Error('recordEvent requiere target_kind y target_id juntos, o ninguno de los dos');
  }

  if (input.kind === 'review_reverted' && !input.reverts_event_id) {
    throw new Error('un evento review_reverted debe indicar reverts_event_id');
  }

  const userId = await getRequiredUserId(client);

  const { data, error } = await client
    .from('learning_event')
    .insert({
      user_id: userId,
      kind: input.kind,
      target_kind: input.target_kind ?? null,
      target_id: input.target_id ?? null,
      skill: input.skill ?? null,
      payload: input.payload ?? {},
      client_event_id: input.client_event_id ?? null,
      reverts_event_id: input.reverts_event_id ?? null,
      ...(input.occurred_at ? { occurred_at: input.occurred_at } : {}),
    } as any)
    .select(COLUMNS)
    .single();

  if (error) {
    throw createRepositoryError(error, 'Failed to record learning event');
  }

  return data as unknown as LearningEvent;
}

export interface GetEventsInput {
  target_kind?: LearningTargetKind;
  target_id?: number;
  kind?: LearningEventKind;
  since?: string;
  limit?: number;
}

export async function getEvents(
  params: GetEventsInput = {},
  client: HanyuClient,
): Promise<LearningEvent[]> {
  const userId = await getRequiredUserId(client);

  let query = client
    .from('learning_event')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(Math.min(500, Math.max(1, params.limit ?? 100)));

  if (params.target_kind) query = query.eq('target_kind', params.target_kind);
  if (params.target_id !== undefined) query = query.eq('target_id', params.target_id);
  if (params.kind) query = query.eq('kind', params.kind);
  if (params.since) query = query.gte('occurred_at', params.since);

  const { data, error } = await query;

  if (error) {
    throw createRepositoryError(error, 'Failed to load learning events');
  }

  return (data ?? []) as unknown as LearningEvent[];
}
