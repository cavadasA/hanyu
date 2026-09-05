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
