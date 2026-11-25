// packages/domain/src/analytics/reading.ts

export interface ReadingSession {
  chars: number;
  seconds: number;
  pinyin_shown: boolean | null;
}

/**
 * Por encima de diez caracteres por segundo no se está leyendo chino, se está
 * desplazando. Abrir y cerrar una lectura dispararía la media y volvería la
 * métrica inútil justo cuando más se usa la app.
 */
const MAX_PLAUSIBLE_CHARS_PER_SECOND = 10;

function average(sessions: readonly ReadingSession[]): number | null {
  const usable = sessions.filter(
    (session) =>
      session.seconds > 0 && session.chars / session.seconds <= MAX_PLAUSIBLE_CHARS_PER_SECOND,
  );

  if (usable.length === 0) return null;

  const chars = usable.reduce((sum, session) => sum + session.chars, 0);
  const seconds = usable.reduce((sum, session) => sum + session.seconds, 0);

  return Math.round((chars / seconds) * 60);
}

export function readingSpeed(sessions: readonly ReadingSession[]): {
  chars_per_minute: number | null;
  with_pinyin_chars_per_minute: number | null;
} {
  return {
    // Sin pinyin es la métrica que importa: con él se lee una transcripción.
    // NULL debe excluirse de ambos cubos porque se desconoce si tenía pinyin o no.
    chars_per_minute: average(sessions.filter((session) => session.pinyin_shown === false)),
    with_pinyin_chars_per_minute: average(sessions.filter((session) => session.pinyin_shown === true)),
  };
}

export function lookupsPer100Tokens(lookups: number, tokens: number): number | null {
  if (tokens <= 0) return null;
  return Math.round((lookups / tokens) * 100 * 10) / 10;
}

export const lookupsPer100Chars = lookupsPer100Tokens;

export interface ReadingAttemptScore {
  score: number;
  total: number;
  /** Ausentes en los intentos anteriores a las preguntas inferenciales: todo era literal. */
  inferential_score?: number;
  inferential_total?: number;
}

export interface ComprehensionRatio {
  correct: number;
  total: number;
  ratio: number;
}

/** Con menos respuestas que esto, un porcentaje dice más del azar que del alumno. */
const MIN_ANSWERS_PER_KIND = 5;

function ratioOf(correct: number, total: number): ComprehensionRatio | null {
  return total < MIN_ANSWERS_PER_KIND ? null : { correct, total, ratio: correct / total };
}

export function comprehensionByKind(attempts: readonly ReadingAttemptScore[]): {
  literal: ComprehensionRatio | null;
  inferential: ComprehensionRatio | null;
} {
  let literalCorrect = 0;
  let literalTotal = 0;
  let inferentialCorrect = 0;
  let inferentialTotal = 0;

  for (const attempt of attempts) {
    const inferentialScore = attempt.inferential_score ?? 0;
    const inferentialCount = attempt.inferential_total ?? 0;
    inferentialCorrect += inferentialScore;
    inferentialTotal += inferentialCount;
    literalCorrect += attempt.score - inferentialScore;
    literalTotal += attempt.total - inferentialCount;
  }

  return {
    literal: ratioOf(literalCorrect, literalTotal),
    inferential: ratioOf(inferentialCorrect, inferentialTotal),
  };
}
