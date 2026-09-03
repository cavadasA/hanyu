//
// La valoración deja de ser solo lo que el usuario dice que sabía. Sigue
// pudiendo corregirla a mano —a veces uno teclea mal algo que sí sabe— pero la
// señal por defecto sale de lo que hizo: si acertó, cuánto tardó y si pidió
// ayuda.
import { normalizeHanzi, normalizePinyinInput, normalizeText } from '../exercises/normalize';
import type { Grade } from './schedule';

export type GradeReason = 'fast' | 'normal' | 'slow' | 'hint' | 'wrong';

export interface WrittenAnswerInput {
  expected: string;
  submitted: string;
  kind: 'hanzi' | 'pinyin' | 'text';
  elapsed_ms: number;
  hints: number;
}

/**
 * Umbrales de tiempo. No son absolutos: por debajo del primero la respuesta
 * salió sin esfuerzo de recuperación, y por encima del segundo hubo búsqueda
 * activa, que es justo lo que un intervalo más corto debe volver a entrenar.
 */
const FAST_MS = 3000;
const SLOW_MS = 12000;

function matches(input: WrittenAnswerInput): boolean {
  switch (input.kind) {
    case 'hanzi':
      return normalizeHanzi(input.submitted) === normalizeHanzi(input.expected);
    case 'pinyin':
      return normalizePinyinInput(input.submitted) === normalizePinyinInput(input.expected);
    case 'text':
      return normalizeText(input.submitted) === normalizeText(input.expected);
  }
}

export function gradeWrittenAnswer(input: WrittenAnswerInput): {
  grade: Grade;
  correct: boolean;
  reason: GradeReason;
} {
  if (!matches(input)) {
    return { grade: 'again', correct: false, reason: 'wrong' };
  }

  if (input.hints > 0) {
    return { grade: 'hard', correct: true, reason: 'hint' };
  }

  if (input.elapsed_ms >= SLOW_MS) {
    return { grade: 'hard', correct: true, reason: 'slow' };
  }

  if (input.elapsed_ms <= FAST_MS) {
    return { grade: 'easy', correct: true, reason: 'fast' };
  }

  return { grade: 'good', correct: true, reason: 'normal' };
}
