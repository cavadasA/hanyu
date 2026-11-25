// Reglas deterministas para el contenido de un punto gramatical, igual que
// validateReading para las lecturas: una lista vacía es la única condición
// para publicar. Lo que exige juicio (si la explicación es buena) lo decide
// quien revisa el diff, no este validador.
import { vocabularyFindings } from '../reading/vocabulary.ts';

export type GrammarIssueKind =
  | 'too_few_examples'
  | 'no_common_error'
  | 'no_markers'
  | 'marker_absent'
  | 'marker_unused'
  | 'unknown_vocabulary'
  | 'word_above_level'
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
  /** Ítems del punto en el sílabo oficial (p. ej. «（2）借用名量词：杯»). */
  point_items?: string[];
}

const MIN_EXAMPLES = 3;
const ENGLISH = /\b(the|is|are|and)\b/i;
const MEANS = /\(\s*[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ ]+\s*\)\s*means/i;

/**
 * Las formas que el sílabo lista en el propio punto son vocabulario de ese
 * nivel aunque la lista de palabras no las traiga sueltas: 杯 es clasificador de
 * HSK 1 aunque el diccionario solo tenga 杯子. Se toman los tramos de hanzi
 * entre separadores; los rótulos (借用名量词) también entran, pero no aparecen
 * en una frase de ejemplo.
 */
function itemForms(items: string[]): string[] {
  return items.flatMap(item => item.match(/\p{Script=Han}+/gu) ?? []);
}

/** `小—` y `第 —` se buscan como `小` y `第`: el guion marca un hueco, no un carácter. */
function normalizeMarker(marker: string): string {
  return marker.replace(/[—\s]/g, '');
}

export function validateGrammarEntry(
  entry: GrammarEntry,
  ctx: GrammarValidationContext,
): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  const pointForms = itemForms(ctx.point_items ?? []);
  const markers = entry.markers.map(normalizeMarker).filter(marker => marker.length > 0);

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
    // Regla común (reading/vocabulary.ts): todo el diccionario, como el móvil,
    // y las mitades de un verbo separable del nivel cuentan como vocabulario.
    for (const finding of vocabularyFindings(example.zh, ctx.dictionary, entry.hsk_level, pointForms)) {
      issues.push(
        finding.kind === 'word_above_level'
          ? { kind: 'word_above_level', example_index: index, detail: `${finding.text} (HSK ${finding.level})` }
          : { kind: 'unknown_vocabulary', example_index: index, detail: finding.text },
      );
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
