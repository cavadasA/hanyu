// Regla de vocabulario común a lecturas, gramática y examen. El texto se
// tokeniza con todo el diccionario (HSK 1–3), igual que lo tokeniza el móvil:
// así una palabra que el alumno verá como HSK 3 (好多, 见面…) no se cuela en un
// texto de nivel 2 por partirse aquí en dos palabras del nivel.
import { tokenizeReading } from './tokenize.ts';

export interface VocabularyEntry {
  hanzi: string;
  hsk_level: number;
}

export type VocabularyFinding =
  | { kind: 'unknown_vocabulary'; text: string }
  | { kind: 'word_above_level'; text: string; level: number };

/**
 * Las palabras de `sentence` que no son vocabulario de nivel `maxLevel` o
 * inferior. `extraForms` (nombres de personajes, formas del propio punto
 * gramatical) valen en cualquier nivel.
 */
export function vocabularyFindings(
  sentence: string,
  dictionary: readonly VocabularyEntry[],
  maxLevel: number,
  extraForms: readonly string[] = [],
): VocabularyFinding[] {
  const levelOf = new Map<string, number>();
  for (const entry of dictionary) {
    levelOf.set(entry.hanzi, Math.min(levelOf.get(entry.hanzi) ?? Infinity, entry.hsk_level));
  }
  for (const form of extraForms) levelOf.set(form, 0);

  // Un verbo separable del nivel (睡觉) se parte con palabras en medio: sus
  // mitades cuentan como vocabulario cuando la otra mitad está en su sitio.
  const splittable = [...levelOf]
    .filter(([form, level]) => level <= maxLevel && Array.from(form).length === 2)
    .map(([form]) => Array.from(form));
  const isSplitHalf = (offset: number, text: string) =>
    splittable.some(([first, second]) =>
      (text === first && sentence.indexOf(second, offset + text.length) !== -1) ||
      (text === second && offset > 0 && sentence.lastIndexOf(first, offset - 1) !== -1),
    );

  const forms = [...levelOf.keys()].map(hanzi => ({ hanzi, pinyin: '' }));
  const findings: VocabularyFinding[] = [];
  let offset = 0;
  for (const token of tokenizeReading(sentence, forms)) {
    const level = levelOf.get(token.text);
    if (token.type === 'unknown' && !isSplitHalf(offset, token.text)) {
      findings.push({ kind: 'unknown_vocabulary', text: token.text });
    } else if (token.type === 'word' && level !== undefined && level > maxLevel && !isSplitHalf(offset, token.text)) {
      findings.push({ kind: 'word_above_level', text: token.text, level });
    }
    offset += token.text.length;
  }
  return findings;
}
