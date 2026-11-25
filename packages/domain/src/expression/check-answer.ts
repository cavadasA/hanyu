// packages/domain/src/expression/check-answer.ts
//
// Primera capa de corrección de una tarea comunicativa: reglas deterministas.
// Lo que pueden juzgar sin ambigüedad (idioma, longitud, vocabulario del nivel,
// marcadores gramaticales del Plan 11) lo juzgan aquí, con el motivo concreto,
// antes de gastar una llamada al evaluador. Al evaluador solo le queda lo que
// las reglas no pueden ver: si la respuesta cumple la intención comunicativa.
import { tokenizeReading } from '../reading/tokenize.ts';

export interface CommunicativeTask {
  /** `<nivel>-<nn>-<descripción>`, p. ej. `2-03-rechazar-invitacion`. */
  slug: string;
  hsk_level: number;
  situation_es: string;
  /** `speak`: la respuesta pasa antes por el reconocedor y se corrige como texto. */
  mode: 'write' | 'speak';
  /** Lo que la respuesta tiene que hacer. Acierto = todas cumplidas. */
  intent: string[];
  required_markers: Array<{ hsk_level: number; code: string }>;
  min_chars: number;
  max_chars: number;
  model_answer: { zh: string; pinyin: string; es: string };
}

export interface CommunicativeContext {
  /** Vocabulario del sílabo; cuenta el de nivel ≤ al de la tarea. */
  dictionary: Array<{ hanzi: string; hsk_level: number }>;
  /** Puntos gramaticales con sus marcadores (Plan 11). */
  grammar_points: Array<{ hsk_level: number; code: string; markers: string[] }>;
  /** Nombres que la situación permite usar aunque no sean vocabulario. */
  proper_nouns?: string[];
}

export type AnswerRuleReason =
  | 'not_chinese'
  | 'too_short'
  | 'too_long'
  | 'unknown_vocabulary'
  | 'marker_missing';

export interface AnswerRulesResult {
  ok: boolean;
  reasons: AnswerRuleReason[];
  /** Tramos de hanzi que no son vocabulario del nivel, en orden de aparición. */
  unknown_words: string[];
  /** Códigos de los puntos gramaticales pedidos de los que no aparece ningún marcador. */
  missing_markers: string[];
}

const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;

export function hanziLength(text: string): number {
  return [...text].filter((character) => HAN.test(character)).length;
}

/**
 * Partes en hanzi de un marcador: `是…的` → `['是', '的']`, `第—` → `['第']`.
 * Un marcador sin hanzi (`。`) no se puede buscar en un texto.
 */
export function markerSegments(marker: string): string[] {
  return marker.split(/[^\p{Script=Han}]+/u).filter(Boolean);
}

function containsMarker(text: string, marker: string): boolean {
  const segments = markerSegments(marker);
  if (segments.length === 0) return false;
  let from = 0;
  for (const segment of segments) {
    const at = text.indexOf(segment, from);
    if (at < 0) return false;
    from = at + segment.length;
  }
  return true;
}

/** Lo que se comprueba sin diccionario: idioma y longitud. La Edge Function lo repite. */
export function checkAnswerShape(answer: string, task: CommunicativeTask): AnswerRuleReason[] {
  if (LATIN.test(answer) || !HAN.test(answer)) return ['not_chinese'];
  const length = hanziLength(answer);
  if (length < task.min_chars) return ['too_short'];
  if (length > task.max_chars) return ['too_long'];
  return [];
}

export function checkAnswerRules(
  answer: string,
  task: CommunicativeTask,
  ctx: CommunicativeContext,
): AnswerRulesResult {
  const reasons = checkAnswerShape(answer, task);
  if (reasons.includes('not_chinese')) {
    return { ok: false, reasons, unknown_words: [], missing_markers: [] };
  }

  const vocabulary = [
    ...ctx.dictionary.filter((entry) => entry.hsk_level <= task.hsk_level).map((entry) => entry.hanzi),
    // Las formas que el propio punto gramatical lista son vocabulario de su nivel.
    ...ctx.grammar_points
      .filter((point) => point.hsk_level <= task.hsk_level)
      .flatMap((point) => point.markers.flatMap(markerSegments)),
    ...(ctx.proper_nouns ?? []),
  ];
  const unknown_words = tokenizeReading(
    answer,
    vocabulary.map((hanzi) => ({ hanzi, pinyin: '' })),
  )
    .filter((token) => token.type === 'unknown')
    .map((token) => token.text);
  if (unknown_words.length > 0) reasons.push('unknown_vocabulary');

  const missing_markers = task.required_markers
    .filter((required) => {
      const point = ctx.grammar_points.find(
        (candidate) => candidate.hsk_level === required.hsk_level && candidate.code === required.code,
      );
      return !point || !point.markers.some((marker) => containsMarker(answer, marker));
    })
    .map((required) => required.code);
  if (missing_markers.length > 0) reasons.push('marker_missing');

  return { ok: reasons.length === 0, reasons, unknown_words, missing_markers };
}
