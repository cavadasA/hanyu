// Escritura con orden de trazos (Plan 13, Tarea 2): los modos `guided` y `quiz` de
// CharacterWriting. A diferencia de `exam` (recognize-handwriting.ts), aquí se sabe qué
// carácter se escribe y se valida trazo a trazo, en orden, sobre la misma cuadrícula de
// 1024 unidades que las medianas de Make Me a Hanzi: no se normaliza por la caja, porque el
// alumno escribe dentro del recuadro.
import type { Grade } from '../scheduling/schedule';
import { resample, type Point } from './recognize-handwriting';

const BOX = 1024;
/** Distancia media máxima (en fracciones del lado del recuadro) entre el trazo y su mediana. */
export const STROKE_TOLERANCE = 0.15;
/** Un trazo de menos de esta fracción de la longitud de su mediana es un toque, no un trazo. */
const MIN_LENGTH_RATIO = 0.3;
/** Errores en un mismo trazo a partir de los cuales el quiz enseña ese trazo. */
export const HINT_AFTER_MISTAKES = 3;

function length(stroke: Point[]): number {
  let total = 0;
  for (let index = 1; index < stroke.length; index += 1) {
    total += Math.hypot(stroke[index][0] - stroke[index - 1][0], stroke[index][1] - stroke[index - 1][1]);
  }
  return total;
}

function distance(user: Point[], expected: Point[]): number {
  const a = resample(user);
  const b = resample(expected);
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.hypot(a[index][0] - b[index][0], a[index][1] - b[index][1]);
  return sum / a.length / BOX;
}

/**
 * ¿Es `user` el trazo `index` del carácter? Tiene que estar cerca de su mediana, en el
 * mismo sentido, y no parecerse más a ningún trazo posterior: así un trazo adelantado no
 * cuenta como el que toca. Un carácter de un solo trazo (一, 乙) no tiene orden que
 * validar, y vale la forma en cualquier sentido.
 */
export function strokeMatches(user: Point[], medians: Point[][], index: number): boolean {
  const expected = medians[index];
  if (!expected || user.length < 2) return false;
  if (length(user) < MIN_LENGTH_RATIO * length(expected)) return false;

  const forward = distance(user, expected);
  const cost = medians.length === 1 ? Math.min(forward, distance([...user].reverse(), expected)) : forward;
  if (cost > STROKE_TOLERANCE) return false;
  for (let later = index + 1; later < medians.length; later += 1) {
    if (distance(user, medians[later]) < cost) return false;
  }
  return true;
}

export interface WritingQuizState {
  medians: Point[][];
  /** El trazo que toca escribir. */
  next: number;
  /** Errores en todo el carácter. */
  mistakes: number;
  /** Errores en el trazo que toca. */
  strokeMistakes: number;
  /** Pistas mostradas (pedidas o tras el tercer error en un trazo). */
  hints: number;
  done: boolean;
}

export interface QuizStep {
  state: WritingQuizState;
  outcome: 'accepted' | 'rejected' | 'ignored';
  /** El trazo que hay que enseñar ahora, o null. */
  hint: number | null;
}

export function startWritingQuiz(medians: Point[][]): WritingQuizState {
  return { medians, next: 0, mistakes: 0, strokeMistakes: 0, hints: 0, done: medians.length === 0 };
}

export function quizStroke(state: WritingQuizState, stroke: Point[]): QuizStep {
  if (state.done) return { state, outcome: 'ignored', hint: null };

  if (strokeMatches(stroke, state.medians, state.next)) {
    const next = state.next + 1;
    return {
      state: { ...state, next, strokeMistakes: 0, done: next >= state.medians.length },
      outcome: 'accepted',
      hint: null,
    };
  }

  const strokeMistakes = state.strokeMistakes + 1;
  const showHint = strokeMistakes === HINT_AFTER_MISTAKES;
  return {
    state: { ...state, mistakes: state.mistakes + 1, strokeMistakes, hints: state.hints + (showHint ? 1 : 0) },
    outcome: 'rejected',
    hint: showHint ? state.next : null,
  };
}

/** El alumno pide ver el trazo que toca. */
export function quizHint(state: WritingQuizState): QuizStep {
  if (state.done) return { state, outcome: 'ignored', hint: null };
  return { state: { ...state, hints: state.hints + 1 }, outcome: 'ignored', hint: state.next };
}

/** Nota FSRS del quiz: 0 errores → Good; 1–2 → Hard; 3 o más, o con pistas → Again. */
export function writingGrade({ mistakes, hints }: { mistakes: number; hints: number }): Grade {
  if (hints > 0 || mistakes >= 3) return 'again';
  if (mistakes > 0) return 'hard';
  return 'good';
}
