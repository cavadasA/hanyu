import { tokenizeReading, type DictionaryEntry } from '../reading/tokenize.ts';

export type ExerciseIssueKind =
  | 'answer_not_in_options'
  | 'duplicate_options'
  | 'unknown_vocabulary'
  | 'no_blank'
  | 'gloss_not_explanation'
  | 'no_unit';

export interface ExerciseIssue {
  kind: ExerciseIssueKind;
  detail?: string;
}

export interface ExerciseValidationContext {
  dictionary: (DictionaryEntry & { hsk_level: number })[];
  max_level: number;
}

const BLANK = '___';

/**
 * Una explicación que solo traduce la respuesta no explica nada: el usuario ya
 * sabe cuál era, lo que no sabe es por qué. Las semillas históricas usaban
 * esta forma, así que ninguna debe llegar al banco nuevo sin ser reescrita.
 *
 * La heurística es deliberadamente tosca: una explicación que cabe en el patrón
 * "X (pinyin) means 'Y'" y no dice nada más, se rechaza. Detectar una buena
 * explicación es imposible automáticamente; detectar esta forma concreta de
 * explicación vacía, no.
 */
const GLOSS_ONLY = /^\s*\S+\s*\([^)]*\)\s*means\s+['"][^'"]*['"]\.?\s*$/i;

interface ExerciseLike {
  slug: string;
  type: string;
  unit_code?: string;
  prompt?: Record<string, unknown>;
  explanation?: string | null;
}

function chineseTextValues(prompt: Record<string, unknown> | undefined): string[] {
  if (!prompt) return [];

  const values: string[] = [];
  for (const key of ['sentence', 'question', 'audio_text']) {
    if (typeof prompt[key] === 'string') values.push(prompt[key] as string);
  }

  for (const key of ['tokens', 'words']) {
    if (Array.isArray(prompt[key])) values.push(prompt[key].map(String).join(''));
  }

  if (Array.isArray(prompt.pairs)) {
    for (const pair of prompt.pairs) {
      if (!pair || typeof pair !== 'object') continue;
      for (const value of [pair.left, pair.right]) {
        if (typeof value === 'string' && /\p{Script=Han}/u.test(value)) values.push(value);
      }
    }
  }

  return values;
}

function unknownVocabulary(
  prompt: Record<string, unknown> | undefined,
  allowed: (DictionaryEntry & { hsk_level: number })[],
): string[] {
  const unknown = new Set<string>();

  for (const value of chineseTextValues(prompt)) {
    const text = value.replaceAll(BLANK, '');
    for (const token of tokenizeReading(text, allowed)) {
      if (token.type === 'unknown') unknown.add(token.text);
    }
  }

  return [...unknown];
}

export function validateExercise(
  exercise: ExerciseLike,
  context: ExerciseValidationContext,
): ExerciseIssue[] {
  const issues: ExerciseIssue[] = [];
  const allowed = context.dictionary.filter((entry) => entry.hsk_level <= context.max_level);
  const prompt = exercise.prompt ?? {};
  const options = Array.isArray(prompt.options) ? prompt.options.map(String) : [];
  const correct = prompt.correct ?? prompt.answer;

  if (!exercise.unit_code) issues.push({ kind: 'no_unit' });

  if (GLOSS_ONLY.test(exercise.explanation ?? '')) {
    issues.push({ kind: 'gloss_not_explanation' });
  }

  if (options.length > 0) {
    if (new Set(options).size !== options.length) {
      issues.push({ kind: 'duplicate_options' });
    }
    if (correct !== undefined && correct !== null && !options.includes(String(correct))) {
      issues.push({ kind: 'answer_not_in_options', detail: String(correct) });
    }
  }

  const sentence = typeof prompt.sentence === 'string' ? prompt.sentence : '';
  if (exercise.type === 'fill_blank' && !sentence.includes(BLANK)) {
    issues.push({ kind: 'no_blank' });
  }

  for (const token of unknownVocabulary(prompt, allowed)) {
    issues.push({ kind: 'unknown_vocabulary', detail: token });
  }

  return issues;
}
