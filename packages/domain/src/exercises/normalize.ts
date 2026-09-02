// Tres normalizaciones y no una, porque las tres comparaciones son distintas.
// Un espacio en "ni hao" es una separación de sílabas y sobra; un espacio en
// "to pay back" separa palabras y cambia el significado.
import { normalizePinyin } from '../pinyin';

// Puntuación latina y china de anchura completa. Se quita en todos los casos:
// nadie falla un ejercicio por olvidar un punto final.
const PUNCTUATION = /[.,!?;:'"()[\]{}¿¡…—–-]|[。，！？；：、“”‘’（）《》〈〉【】]/g;

export function normalizeText(input: string): string {
  return String(input ?? '')
    .replace(PUNCTUATION, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeHanzi(input: string): string {
  return String(input ?? '')
    .replace(PUNCTUATION, '')
    .replace(/\s+/g, '');
}

export function normalizePinyinInput(input: string): string {
  // Un teclado latino no produce ü, así que se escribe v. Se traduce antes de
  // normalizar porque normalizePinyin conserva la diéresis a propósito.
  const withUmlaut = String(input ?? '')
    .replace(PUNCTUATION, ' ')
    .replace(/v/gi, 'ü');

  return normalizePinyin(withUmlaut);
}
