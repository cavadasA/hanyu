// La acepción de cada palabra de una lectura se decide al escribir la lectura y
// se valida en la build, no en el móvil: el pinyin de la frase la decide casi
// siempre, y donde no basta lo decide una anotación explícita.
import type { DictionaryEntry } from './tokenize.ts';
import { pinyinLetters, type PinyinLetter } from './pinyin.ts';

/** Clave natural de `words`: (hanzi, hsk_level, sense_index). */
export interface SenseKey {
  hsk_level: number;
  sense_index: number | null;
}

export interface SenseAnnotation extends SenseKey {
  sentence: number;
  hanzi: string;
  /** Aparición de esa palabra dentro de la frase, desde 0. */
  occurrence: number;
}

export interface ResolvedSense extends SenseKey {
  sentence: number;
  hanzi: string;
  occurrence: number;
  by: 'only' | 'pinyin' | 'annotation';
}

export type SenseIssueKind =
  | 'sense_unresolved'
  | 'sense_conflict'
  | 'annotation_orphan'
  | 'sense_above_level';

export interface SenseIssue {
  kind: SenseIssueKind;
  sentence: number;
  hanzi: string;
  detail?: string;
}

export interface SenseToken {
  text: string;
  /** Pinyin de la frase alineado con este token; null si no hay alineación. */
  pinyin: string | null;
  /**
   * Parte del nombre de un personaje (张东 → 张, 东): no es vocabulario y no se
   * resuelve, pero cuenta como aparición, igual que en el tokenizador del móvil.
   */
  proper_noun?: boolean;
}

export interface SenseReading {
  hsk_level: number;
  sentences: Array<{ tokens: SenseToken[] }>;
  senses?: SenseAnnotation[];
}

type LeveledEntry = DictionaryEntry & { hsk_level: number };

/**
 * 一 y 不 cambian de tono según la sílaba siguiente; el diccionario y la frase
 * pueden escribir uno u otro y siguen siendo la misma palabra.
 */
function withoutSandhi(letters: PinyinLetter[], hanzi: string): PinyinLetter[] {
  return letters.map((letter, index) => {
    const previous = letters[index - 1]?.base;
    const sandhi =
      (hanzi.includes('一') && previous === 'y' && letter.base === 'i') ||
      (hanzi.includes('不') && previous === 'b' && letter.base === 'u');
    return sandhi ? { ...letter, tone: 0 } : letter;
  });
}

/**
 * ¿Dice la frase (`sentence`) la misma pronunciación que la entrada (`entry`)?
 * Con `neutral`, una sílaba átona de la frase vale por la tónica de la entrada:
 * 过去 se lee guòqu como complemento y guòqù como sustantivo.
 */
export function pinyinMatches(
  sentence: string,
  entry: string,
  hanzi = '',
  { neutral = false }: { neutral?: boolean } = {},
): boolean {
  const left = withoutSandhi(pinyinLetters(sentence), hanzi);
  const right = withoutSandhi(pinyinLetters(entry), hanzi);
  return (
    left.length === right.length &&
    left.every((letter, index) =>
      letter.base === right[index].base &&
      (letter.tone === right[index].tone || (neutral && letter.tone === 0)),
    )
  );
}

function sameSense(left: DictionaryEntry, right: DictionaryEntry): boolean {
  // Sin significado no se puede afirmar que dos entradas sean la misma.
  if (typeof left.meaning_en !== 'string' || left.meaning_en === '') return false;
  return (
    left.hanzi === right.hanzi &&
    left.meaning_en === right.meaning_en &&
    (left.meaning_es ?? null) === (right.meaning_es ?? null) &&
    (left.pos ?? null) === (right.pos ?? null) &&
    pinyinMatches(left.pinyin, right.pinyin)
  );
}

/**
 * El sílabo repite algunas palabras en dos niveles con el mismo pinyin,
 * significado y categoría (好, 多, 家…). No son dos acepciones: queda la de
 * nivel más bajo.
 */
export function distinctSenses<T extends DictionaryEntry>(entries: T[]): T[] {
  const byLevel = [...entries].sort(
    (left, right) => (left.hsk_level ?? Number.MAX_SAFE_INTEGER) - (right.hsk_level ?? Number.MAX_SAFE_INTEGER),
  );
  const kept: T[] = [];
  for (const entry of byLevel) {
    if (!kept.some(other => sameSense(other, entry))) kept.push(entry);
  }
  return kept;
}

function keyOf(entry: DictionaryEntry): SenseKey {
  return { hsk_level: entry.hsk_level ?? 0, sense_index: entry.sense_index ?? null };
}

function sameKey(entry: DictionaryEntry, key: SenseKey): boolean {
  return entry.hsk_level === key.hsk_level && (entry.sense_index ?? null) === (key.sense_index ?? null);
}

export function resolveSenses(
  reading: SenseReading,
  dictionary: LeveledEntry[],
): { resolved: ResolvedSense[]; issues: SenseIssue[] } {
  const entriesByHanzi = new Map<string, LeveledEntry[]>();
  for (const entry of dictionary) {
    const entries = entriesByHanzi.get(entry.hanzi) ?? [];
    entries.push(entry);
    entriesByHanzi.set(entry.hanzi, entries);
  }

  const annotations = reading.senses ?? [];
  const used = new Set<SenseAnnotation>();
  const resolved: ResolvedSense[] = [];
  const issues: SenseIssue[] = [];

  reading.sentences.forEach((sentence, sentenceIndex) => {
    const seen = new Map<string, number>();

    for (const token of sentence.tokens) {
      const entries = entriesByHanzi.get(token.text);
      if (!entries) continue;

      const hanzi = token.text;
      const occurrence = seen.get(hanzi) ?? 0;
      seen.set(hanzi, occurrence + 1);
      if (token.proper_noun) continue;

      const annotation = annotations.find(
        candidate =>
          candidate.sentence === sentenceIndex &&
          candidate.hanzi === hanzi &&
          candidate.occurrence === occurrence,
      );
      if (annotation) used.add(annotation);

      const candidates = distinctSenses(entries);
      let chosen: LeveledEntry | null = null;
      let by: ResolvedSense['by'] = 'only';

      if (candidates.length === 1) {
        chosen = candidates[0];
        if (annotation) issues.push({ kind: 'annotation_orphan', sentence: sentenceIndex, hanzi });
      } else if (annotation) {
        const annotated = candidates.find(candidate => sameKey(candidate, annotation));
        if (!annotated) {
          issues.push({
            kind: 'sense_conflict',
            sentence: sentenceIndex,
            hanzi,
            detail: `no hay entrada ${hanzi} HSK ${annotation.hsk_level} #${annotation.sense_index ?? '-'}`,
          });
          continue;
        }
        if (token.pinyin !== null && !pinyinMatches(token.pinyin, annotated.pinyin, hanzi, { neutral: true })) {
          issues.push({
            kind: 'sense_conflict',
            sentence: sentenceIndex,
            hanzi,
            detail: `anotado ${annotated.pinyin}, la frase dice ${token.pinyin}`,
          });
          continue;
        }
        chosen = annotated;
        by = 'annotation';
      } else {
        const sentencePinyin = token.pinyin;
        const exact = sentencePinyin === null
          ? []
          : candidates.filter(candidate => pinyinMatches(sentencePinyin, candidate.pinyin, hanzi));
        // Solo si nada coincide exactamente se admite la sílaba átona: así 地
        // átono (de) sigue siendo la partícula y no la tónica dì.
        const byPinyin = exact.length > 0 || sentencePinyin === null
          ? exact
          : candidates.filter(candidate => pinyinMatches(sentencePinyin, candidate.pinyin, hanzi, { neutral: true }));
        if (byPinyin.length !== 1) {
          issues.push({ kind: 'sense_unresolved', sentence: sentenceIndex, hanzi });
          continue;
        }
        chosen = byPinyin[0];
        by = 'pinyin';
      }

      // Solo cuando había donde elegir: el nivel de una forma con una sola
      // entrada es cosa del vocabulario de la lectura, no de su acepción.
      if (entries.length > 1 && chosen.hsk_level > reading.hsk_level) {
        issues.push({
          kind: 'sense_above_level',
          sentence: sentenceIndex,
          hanzi,
          detail: `HSK ${chosen.hsk_level} en una lectura HSK ${reading.hsk_level}`,
        });
      }
      if (entries.length > 1) {
        resolved.push({ sentence: sentenceIndex, hanzi, occurrence, ...keyOf(chosen), by });
      }
    }
  });

  for (const annotation of annotations) {
    if (!used.has(annotation)) {
      issues.push({ kind: 'annotation_orphan', sentence: annotation.sentence, hanzi: annotation.hanzi });
    }
  }

  return { resolved, issues };
}
