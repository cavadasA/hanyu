import type { ReadingToken } from '@hanyu/data';

/**
 * Reconstruye la frase a la que pertenece un token.
 *
 * El tokenizador no guarda frases ni desplazamientos, pero sí emite los signos
 * de puntuación como tokens propios, así que la frase es el tramo entre dos
 * terminadores.
 *
 * La coma no termina frase: separa cláusulas. Cortar en ella daría contextos de
 * tres caracteres, inútiles para entender cómo se usa la palabra.
 */
const SENTENCE_END = new Set(['。', '！', '？', '…', '.', '!', '?']);

export interface Sentence {
  text: string;
  tokens: ReadingToken[];
}

export function sentenceOf(tokens: ReadingToken[], tokenId: string): Sentence | null {
  const index = tokens.findIndex((token) => token.id === tokenId);
  if (index < 0) {
    return null;
  }

  let start = index;
  while (start > 0) {
    const previous = tokens[start - 1];
    if (previous.type === 'punctuation' && SENTENCE_END.has(previous.text)) break;
    start -= 1;
  }

  let end = index;
  while (end < tokens.length - 1) {
    if (tokens[end].type === 'punctuation' && SENTENCE_END.has(tokens[end].text)) break;
    end += 1;
  }

  const slice = tokens.slice(start, end + 1);
  return { text: slice.map((token) => token.text).join(''), tokens: slice };
}
