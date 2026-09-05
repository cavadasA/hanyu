// packages/domain/src/analytics/retention.ts
//
// Cierra el lazo del Plan 4A: allí se fija una retención objetivo y aquí se
// comprueba si la real converge a ella. Un objetivo que nadie mide es una
// preferencia, no un control.
export interface RetentionReview {
  occurred_at: string;
  grade: string | number;
  /** Fase de la tarjeta ANTES del repaso. */
  phase_before: string;
}

export interface Retention {
  /** null cuando no hay muestra: cero repasos no es cero retención. */
  rate: number | null;
  sample: number;
  target_gap: number | null;
}

// Jerarquía del mapeo 1 ↔ again:
// 1. Canónica: en la BD apply_review guarda grade como 1..4 (types.ts:395).
// 2. Frontera API: la RPC learning_report() mapea 1..4 a 'again'..'easy'.
// 3. Repositorio: stats.ts (normalizeReportGrade) normaliza como salvaguarda ante payloads directos/mocks.
// 4. Dominio (aquí): isAgain actúa como defensa en profundidad pura para que revisiones
//    históricas o fixtures sin normalizar nunca cuenten '1' como un acierto.
function isAgain(grade: string | number): boolean {
  return grade === 'again' || grade === '1' || grade === 1;
}

export function observedRetention(
  reviews: readonly RetentionReview[],
  now: Date,
  windowDays: number,
  target?: number,
): Retention {
  const from = now.getTime() - windowDays * 86_400_000;

  const eligible = reviews.filter(
    (review) =>
      review.phase_before === 'review' && Date.parse(review.occurred_at) >= from,
  );

  if (eligible.length === 0) {
    return { rate: null, sample: 0, target_gap: null };
  }

  const recalled = eligible.filter((review) => !isAgain(review.grade)).length;
  const rate = recalled / eligible.length;

  return {
    rate,
    sample: eligible.length,
    target_gap: target === undefined ? null : rate - target,
  };
}
