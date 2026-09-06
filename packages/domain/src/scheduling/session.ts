import type { SchedulingState } from './schedule';

/**
 * Tope de apariciones de una misma tarjeta dentro de una sesión.
 *
 * Sin tope, FSRS puede reencolar indefinidamente: `hard` sobre una tarjeta en
 * learning devuelve siempre el mismo paso —seis minutos y el mismo
 * `learning_steps`—, así que es un punto fijo. Tres pases bastan para que un
 * paso de aprendizaje cumpla su función; a partir de ahí la tarjeta se lleva a
 * la sesión siguiente en vez de alargar ésta sin final.
 */
export const MAX_SESSION_SHOWINGS = 3;

export interface SessionRequeueInput {
  /** Estado FSRS resultante de la valoración que se acaba de registrar. */
  state: SchedulingState;
  /** Veces que la tarjeta se ha mostrado en esta sesión, contando la actual. */
  shown: number;
  /** Tope de apariciones. Por defecto {@link MAX_SESSION_SHOWINGS}. */
  max?: number;
}

/**
 * Decide si una tarjeta recién valorada vuelve a la cola de la misma sesión.
 *
 * El criterio es el estado, no el reloj: una tarjeta en `learning` o
 * `relearning` está justo en medio de sus pasos de aprendizaje y volver a verla
 * hoy es lo que esos pasos significan; una que ya graduó a `review` tiene un
 * intervalo en días y repetirla ahora no entrena nada.
 *
 * Un horizonte temporal —"vence dentro de menos de media hora"— parece lo mismo
 * pero no lo es: no distingue el paso de aprendizaje que avanza del que se
 * queda quieto, y por eso dejaba sesiones sin final.
 */
export function shouldRequeueInSession({
  state,
  shown,
  max = MAX_SESSION_SHOWINGS,
}: SessionRequeueInput): boolean {
  if (state.state !== 'learning' && state.state !== 'relearning') {
    return false;
  }
  return shown < max;
}
