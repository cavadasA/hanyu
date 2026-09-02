import type { SupportLanguage } from './types';

interface Glossed {
  meaning_en?: string | null;
  meaning_es?: string | null;
}

/**
 * Una tarjeta sin glosa no es utilizable, así que el idioma de apoyo elige
 * preferencia, no exclusividad: si falta el español se muestra el inglés.
 */
export function resolveGloss(word: Glossed, language: SupportLanguage): string {
  const preferred = language === 'es' ? word.meaning_es : word.meaning_en;
  if (preferred && preferred.trim()) {
    return preferred.trim();
  }

  const fallback = language === 'es' ? word.meaning_en : word.meaning_es;
  return fallback?.trim() ?? '';
}
