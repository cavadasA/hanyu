// packages/domain/src/analytics/mastery.ts
//
// "Cobertura del sílabo" del Plan 1B cuenta lo que la app enseña. Esto cuenta
// lo que el usuario ha demostrado. El criterio de salida del Plan 1 pedía las
// dos, y confundirlas haría creer que tener el contenido es saberlo.
import { MASTERED_STABILITY_DAYS } from '../scheduling/schedule';

export interface SkillStateRow {
  target_id: number;
  skill: string;
  stability: number | null;
  suspended: boolean;
  last_reviewed_at: string | null;
}

export interface SkillMastery {
  demonstrated: number;
  started: number;
  /** Días desde la demostración más antigua que aún se cuenta como válida. */
  oldest_days: number | null;
}

const SKILLS = ['recognition', 'recall', 'listening', 'reading', 'production'] as const;

export function isDemonstrated(state: SkillStateRow, now?: Date): boolean {
  if (state.suspended || (state.stability ?? 0) < MASTERED_STABILITY_DAYS) {
    return false;
  }
  if (now && state.last_reviewed_at) {
    const elapsedDays = Math.max(0, (now.getTime() - Date.parse(state.last_reviewed_at)) / 86_400_000);
    if (elapsedDays > (state.stability ?? 0)) {
      return false;
    }
  }
  return true;
}

export function masteryBySkill(
  states: readonly SkillStateRow[],
  now: Date,
): Record<string, SkillMastery> {
  const result: Record<string, SkillMastery> = {};

  for (const skill of SKILLS) {
    const mine = states.filter((state) => state.skill === skill);
    const demonstrated = mine.filter((state) => isDemonstrated(state, now));

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
  scope: readonly number[],
  now: Date,
): { in_scope: number; started: number; demonstrated: number; percent_demonstrated: number } {
  const inScope = new Set(scope);
  const relevant = states.filter(
    (state) => state.skill === 'recognition' && inScope.has(state.target_id),
  );
  const demonstrated = relevant.filter((state) => isDemonstrated(state, now)).length;

  return {
    in_scope: inScope.size,
    started: relevant.filter((state) => !state.suspended).length,
    demonstrated,
    percent_demonstrated: inScope.size === 0 ? 0 : Math.round((demonstrated / inScope.size) * 100),
  };
}
