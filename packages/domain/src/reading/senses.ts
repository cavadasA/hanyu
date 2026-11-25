// La acepción de cada palabra de una lectura se decide al escribir la lectura y
// se valida en la build, no en el móvil: el pinyin de la frase la decide casi
// siempre, y donde no basta lo decide una anotación explícita.
import type { DictionaryEntry } from './tokenize.ts';

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
}

export interface SenseReading {
  hsk_level: number;
  sentences: Array<{ tokens: SenseToken[] }>;
  senses?: SenseAnnotation[];
}

type LeveledEntry = DictionaryEntry & { hsk_level: number };

function normalizePinyin(pinyin: string, hanzi = ''): string {
  let normalized = pinyin.normalize('NFC').toLowerCase().replace(/[\s'’·\-.,!?。，？！]/g, '');
  // 一 y 不 cambian de tono según la sílaba siguiente; el diccionario y la
  // frase pueden escribir uno u otro y siguen siendo la misma palabra.
  if (hanzi.includes('一')) normalized = normalized.replace(/y[īíì]/g, 'yi');
  if (hanzi.includes('不')) normalized = normalized.replace(/b[ùú]/g, 'bu');
  return normalized;
}

export function pinyinMatches(left: string, right: string, hanzi = ''): boolean {
  return normalizePinyin(left, hanzi) === normalizePinyin(right, hanzi);
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
        if (token.pinyin !== null && !pinyinMatches(annotated.pinyin, token.pinyin, hanzi)) {
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
        const byPinyin = token.pinyin === null
          ? []
          : candidates.filter(candidate => pinyinMatches(candidate.pinyin, token.pinyin!, hanzi));
        if (byPinyin.length !== 1) {
          issues.push({ kind: 'sense_unresolved', sentence: sentenceIndex, hanzi });
          continue;
        }
        chosen = byPinyin[0];
        by = 'pinyin';
      }

      if (chosen.hsk_level > reading.hsk_level) {
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
