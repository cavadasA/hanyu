//
// La función de valor de la auditoría, entera salvo un término. El
// "interés del usuario" queda fuera a propósito: no hay ninguna señal de
// interés en el sistema, y un sumando que siempre vale cero solo sirve para
// aparentar que se tuvo en cuenta.
//
// El valor y la explicación se calculan juntos porque en pantalla se muestran
// juntos, y calcularlos por separado permitiría que divergieran.

export type RankReasonKind =
  | 'reinforces_targets'
  | 'comprehensible'
  | 'too_easy'
  | 'too_many_unknown'
  | 'new_topic'
  | 'seen_recently';

export interface RankReason {
  kind: RankReasonKind;
  count?: number;
  ratio?: number;
}

export interface RankableContent {
  id: string;
  topic?: string | null;
  word_ids: number[];
}

export interface LearnerModel {
  /** Lo que se está aprendiendo ahora: la unidad activa. */
  target_word_ids: number[];
  /** Lo que ya se sostiene: no cuesta leerlo. */
  known_word_ids: number[];
  recent_content_ids: string[];
  covered_topics: string[];
}

/**
 * Rango de comprensibilidad. Por debajo de 0,92 la lectura se descifra en vez
 * de leerse; por encima de 0,98 no queda nada que aprender.
 *
 * Se exporta porque la lista de lecturas etiqueta cada una con este mismo
 * rango antes de abrirla. Con dos copias del umbral, la etiqueta que ve el
 * usuario y el valor que usa el planificador podrían discrepar sobre la misma
 * lectura, que es justo la incoherencia que la etiqueta debería evitar.
 */
export const COMPREHENSIBLE_MIN = 0.92;
export const COMPREHENSIBLE_MAX = 0.98;

export function rankContent(
  item: RankableContent,
  learner: LearnerModel,
): { value: number; reasons: RankReason[] } {
  if (item.word_ids.length === 0) {
    return { value: 0, reasons: [] };
  }

  const targets = new Set(learner.target_word_ids);
  const known = new Set(learner.known_word_ids);
  const reasons: RankReason[] = [];
  let value = 0;

  const reinforced = item.word_ids.filter((id) => targets.has(id)).length;
  if (reinforced > 0) {
    value += reinforced * 2;
    reasons.push({ kind: 'reinforces_targets', count: reinforced });
  }

  const comprehensible =
    item.word_ids.filter((id) => known.has(id) || targets.has(id)).length / item.word_ids.length;

  if (comprehensible >= COMPREHENSIBLE_MIN && comprehensible <= COMPREHENSIBLE_MAX) {
    value += 10;
    reasons.push({ kind: 'comprehensible', ratio: comprehensible });
  } else if (comprehensible < COMPREHENSIBLE_MIN) {
    value -= (COMPREHENSIBLE_MIN - comprehensible) * 40;
    reasons.push({ kind: 'too_many_unknown', ratio: comprehensible });
  } else {
    value -= (comprehensible - COMPREHENSIBLE_MAX) * 80;
    reasons.push({ kind: 'too_easy', ratio: comprehensible });
  }

  if (item.topic && !learner.covered_topics.includes(item.topic)) {
    value += 3;
    reasons.push({ kind: 'new_topic' });
  }

  if (learner.recent_content_ids.includes(item.id)) {
    value -= 8;
    reasons.push({ kind: 'seen_recently' });
  }

  return { value, reasons };
}
