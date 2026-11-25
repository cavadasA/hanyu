// Preparación para el examen a partir de los simulacros (Plan 12). Solo cuentan los
// simulacros completos y no repetidos: una forma repetida mide memoria, no nivel, y una
// parte suelta no es el examen. Sin simulacros, null (regla del Plan 9: ninguna métrica
// sin datos muestra un cero).
import type { ExamPartCode } from '../exam/types';

export interface ExamAttemptSummary {
  scope: 'part' | 'section' | 'full';
  repeated: boolean;
  finished_at: string;
  total_percent: number;
  part_scores: Partial<Record<ExamPartCode, { correct: number; total: number; percent: number }>>;
}

export interface ExamReadiness {
  last_percent: number | null;
  trend: number[];
  weakest_part: ExamPartCode | null;
}

export function examReadiness(attempts: ExamAttemptSummary[]): ExamReadiness | null {
  const counted = attempts
    .filter(attempt => attempt.scope === 'full' && !attempt.repeated)
    .sort((left, right) => left.finished_at.localeCompare(right.finished_at));
  if (counted.length === 0) return null;

  const last = counted[counted.length - 1];
  const parts = Object.entries(last.part_scores) as Array<[ExamPartCode, { percent: number }]>;
  const weakest = parts.reduce<[ExamPartCode, number] | null>(
    (lowest, [part, score]) => (lowest === null || score.percent < lowest[1] ? [part, score.percent] : lowest),
    null,
  );

  return {
    last_percent: last.total_percent,
    trend: counted.map(attempt => attempt.total_percent),
    weakest_part: weakest?.[0] ?? null,
  };
}
