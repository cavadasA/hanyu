// packages/domain/src/analytics/mastery.ts
//
// "Cobertura del sílabo" del Plan 1B cuenta lo que la app enseña. Esto cuenta
// lo que el usuario ha demostrado. El criterio de salida del Plan 1 pedía las
// dos, y confundirlas haría creer que tener el contenido es saberlo.
import { fsrs, State, type Card } from 'ts-fsrs';
import { MASTERED_STABILITY_DAYS } from '../scheduling/schedule';
import { LEARNING_SKILLS } from '../expression/skills';

export { MASTERED_STABILITY_DAYS };

export interface SkillStateRow {
  target_id: number;
  skill: string;
  stability: number | null;
  suspended: boolean;
  last_reviewed_at: string | null;
  in_scope?: boolean;
}

export interface SkillMastery {
  demonstrated: number;
  started: number;
  /** Días desde la demostración más antigua que aún se cuenta como válida. */
  oldest_days: number | null;
}

const defaultFsrs = fsrs();

export function isDemonstrated(
  state: SkillStateRow,
  now: Date,
  targetRetention: number = 0.9,
): boolean {
  if (state.suspended || (state.stability ?? 0) < MASTERED_STABILITY_DAYS || !state.last_reviewed_at) {
    return false;
  }
  const lastReview = new Date(state.last_reviewed_at);
  if (isNaN(lastReview.getTime())) {
    return false;
  }
  const card: Card = {
    due: now,
    stability: state.stability!,
    difficulty: 0,
    elapsed_days: 0,
    learning_steps: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: State.Review,
    last_review: lastReview,
  };
  const currentRetrievability = defaultFsrs.get_retrievability(
    card,
    now,
    false,
  );
  return currentRetrievability >= targetRetention;
}

export function masteryBySkill(
  states: readonly SkillStateRow[],
  now: Date,
  targetRetention: number = 0.9,
): Record<string, SkillMastery> {
  const result: Record<string, SkillMastery> = {};

  for (const skill of LEARNING_SKILLS) {
    const mine = states.filter((state) => state.skill === skill);
    const demonstrated = mine.filter((state) => isDemonstrated(state, now, targetRetention));

    let oldest: number | null = null;
    for (const state of demonstrated) {
      if (!state.last_reviewed_at) continue;
      const days = Math.floor((now.getTime() - Date.parse(state.last_reviewed_at)) / 86_400_000);
      if (oldest === null || days > oldest) oldest = days;
    }

    result[skill] = {
      demonstrated: demonstrated.length,
      started: mine.filter((state) => !state.suspended).length,
      oldest_days: oldest,
    };
  }

  return result;
}

export function syllabusCoverage(
  states: readonly SkillStateRow[],
  scope: readonly number[] | number,
  now: Date,
  targetRetention: number = 0.9,
): { in_scope: number; started: number; demonstrated: number; percent_demonstrated: number } {
  const inScopeSet = typeof scope === 'number' ? null : new Set(scope);
  const inScopeCount = typeof scope === 'number' ? scope : inScopeSet!.size;

  const relevant = states.filter((state) => {
    if (state.skill !== 'recognition') return false;
    if (inScopeSet) return inScopeSet.has(state.target_id);
    return state.in_scope ?? false;
  });
  const demonstrated = relevant.filter((state) => isDemonstrated(state, now, targetRetention)).length;

  return {
    in_scope: inScopeCount,
    started: relevant.filter((state) => !state.suspended).length,
    demonstrated,
    percent_demonstrated: inScopeCount === 0 ? 0 : Math.round((demonstrated / inScopeCount) * 100),
  };
}
