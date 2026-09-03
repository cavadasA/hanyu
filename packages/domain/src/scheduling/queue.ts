// El servidor decide qué tarjetas entran hoy; esto decide en qué orden se ven.
// Vive en el cliente porque ordenar por riesgo necesita la retrievabilidad, y
// calcularla en SQL sería una segunda implementación de la curva de olvido.
import type { FSRSParameters } from 'ts-fsrs';
import { retrievability, type SchedulingState } from './schedule';

export type QueueStrategy = 'due' | 'frequency';

export interface QueueEntry {
  is_new: boolean;
  scheduling: SchedulingState;
  frequency?: number | null;
}

export function orderQueue<T extends QueueEntry>(
  cards: readonly T[],
  now: Date,
  params: FSRSParameters,
  strategy: QueueStrategy,
): T[] {
  const reviews = cards.filter((card) => !card.is_new);
  const fresh = cards.filter((card) => card.is_new);

  // Menor retrievabilidad primero: es lo que está más cerca de perderse.
  const orderedReviews = [...reviews].sort(
    (a, b) =>
      retrievability(a.scheduling, now, params) - retrievability(b.scheduling, now, params),
  );

  const orderedNew =
    strategy === 'frequency'
      ? [...fresh].sort(
          (a, b) =>
            (a.frequency ?? Number.MAX_SAFE_INTEGER) -
            (b.frequency ?? Number.MAX_SAFE_INTEGER),
        )
      : fresh;

  return [...orderedReviews, ...orderedNew];
}
