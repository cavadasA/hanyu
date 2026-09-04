import type { ExerciseKind } from './contract';

/**
 * El orden va de reconocer a producir. Empezar por dictado obliga a producir
 * algo que todavía no se reconoce y mide frustración, no aprendizaje.
 */
const STEP: Record<ExerciseKind, number> = {
  multiple_choice: 0,
  matching: 0,
  fill_blank: 1,
  reorder: 1,
  dictation: 2,
};

export function orderExercises<T extends { type: ExerciseKind }>(
  exercises: readonly T[],
): T[] {
  return [...exercises].sort((left, right) => STEP[left.type] - STEP[right.type]);
}
