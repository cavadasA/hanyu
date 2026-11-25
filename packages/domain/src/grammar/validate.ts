// Reglas deterministas para el contenido de un punto gramatical, igual que
// validateReading para las lecturas: una lista vacía es la única condición
// para publicar. Lo que exige juicio (si la explicación es buena) lo decide
// quien revisa el diff, no este validador.
import { tokenizeReading } from '../reading/tokenize.ts';

export type GrammarIssueKind =
  | 'too_few_examples'
  | 'no_common_error'
  | 'no_markers'
  | 'marker_absent'
  | 'marker_unused'
  | 'unknown_vocabulary'
  | 'missing_pinyin'
  | 'missing_translation'
  | 'english_explanation'
  | 'means_pattern'
  | 'see_also_unknown';

export interface GrammarIssue {
  kind: GrammarIssueKind;
  example_index?: number;
  detail?: string;
}

export interface GrammarPointRef {
  hsk_level: number;
  code: string;
}

export interface GrammarEntry {
  hsk_level: number;
  code: string;
  pattern: string;
  explanation: string;
  markers: string[];
  examples: Array<{ zh: string; pinyin: string; es: string }>;
  common_errors: Array<{ wrong: string; right: string; why: string }>;
  see_also: GrammarPointRef[];
}

export interface GrammarValidationContext {
  dictionary: Array<{ hanzi: string; hsk_level: number }>;
  known_points: GrammarPointRef[];
}

const MIN_EXAMPLES = 3;
const ENGLISH = /\b(the|is|are|and)\b/i;
const MEANS = /\(\s*[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ ]+\s*\)\s*means/i;

/** `小—` y `第 —` se buscan como `小` y `第`: el guion marca un hueco, no un carácter. */
function normalizeMarker(marker: string): string {
  return marker.replace(/[—\s]/g, '');
}

/**
 * Un verbo separable del nivel (睡觉, 跑步) se parte con otras palabras en
 * medio: 睡了八个小时觉. Sus mitades sueltas no son palabras del diccionario,
 * pero sí vocabulario del nivel cuando la otra mitad está en su sitio: la
 * primera antes, la segunda después.
 */
function isSplitHalf(sentence: string, offset: number, text: string, splittable: string[][]): boolean {
  return splittable.some(([first, second]) =>
    (text === first && sentence.indexOf(second, offset + text.length) !== -1) ||
    (text === second && sentence.lastIndexOf(first, offset - 1) !== -1 && offset > 0),
  );
}

export function validateGrammarEntry(
  entry: GrammarEntry,
  ctx: GrammarValidationContext,
): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  const allowed = ctx.dictionary
    .filter(word => word.hsk_level <= entry.hsk_level)
    .map(word => ({ hanzi: word.hanzi, pinyin: '' }));
  const markers = entry.markers.map(normalizeMarker).filter(marker => marker.length > 0);
  const splittable = allowed.map(word => Array.from(word.hanzi)).filter(chars => chars.length === 2);

  if (entry.examples.length < MIN_EXAMPLES) {
    issues.push({ kind: 'too_few_examples', detail: `${entry.examples.length} < ${MIN_EXAMPLES}` });
  }
  if (entry.common_errors.length === 0) {
    issues.push({ kind: 'no_common_error' });
  }
  if (markers.length === 0) {
    issues.push({ kind: 'no_markers' });
  }

  entry.examples.forEach((example, index) => {
    if (!example.pinyin?.trim()) {
      issues.push({ kind: 'missing_pinyin', example_index: index });
    }
    if (!example.es?.trim()) {
      issues.push({ kind: 'missing_translation', example_index: index });
    }
    let offset = 0;
    for (const token of tokenizeReading(example.zh, allowed)) {
      if (token.type === 'unknown' && !isSplitHalf(example.zh, offset, token.text, splittable)) {
        issues.push({ kind: 'unknown_vocabulary', example_index: index, detail: token.text });
      }
      offset += token.text.length;
    }
    if (markers.length > 0 && !markers.some(marker => example.zh.includes(marker))) {
      issues.push({ kind: 'marker_absent', example_index: index });
    }
  });

  for (const marker of entry.markers) {
    const normalized = normalizeMarker(marker);
    if (normalized && !entry.examples.some(example => example.zh.includes(normalized))) {
      issues.push({ kind: 'marker_unused', detail: marker });
    }
  }

  if (ENGLISH.test(entry.explanation)) {
    issues.push({ kind: 'english_explanation' });
  }
  if (MEANS.test(entry.explanation)) {
    issues.push({ kind: 'means_pattern' });
  }

  for (const ref of entry.see_also) {
    const known = ctx.known_points.some(
      point => point.hsk_level === ref.hsk_level && point.code === ref.code,
    );
    if (!known) {
      issues.push({ kind: 'see_also_unknown', detail: `${ref.hsk_level}-${ref.code}` });
    }
  }

  return issues;
}
