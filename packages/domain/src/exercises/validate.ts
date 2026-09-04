import { tokenizeReading, type DictionaryEntry } from '../reading/tokenize.ts';

export type ExerciseIssueKind =
  | 'answer_not_in_options'
  | 'duplicate_options'
  | 'invalid_reorder'
  | 'unknown_vocabulary'
  | 'no_blank'
  | 'gloss_not_explanation'
  | 'explanation_not_spanish'
  | 'unit_level_mismatch'
  | 'invalid_target'
  | 'no_unit';

export interface ExerciseIssue {
  kind: ExerciseIssueKind;
  detail?: string;
}

export interface ExerciseValidationContext {
  dictionary: (DictionaryEntry & { hsk_level: number })[];
  max_level: number;
  units?: Array<{ code: string; hsk_level: number }>;
}

const BLANK = '___';

/**
 * Una explicación que solo traduce la respuesta no explica nada: el usuario ya
 * sabe cuál era, lo que no sabe es por qué. Las semillas históricas usaban
 * esta forma, así que ninguna debe llegar al banco nuevo sin ser reescrita.
 *
 * La heurística es deliberadamente tosca: se rechaza la glosa "X (pinyin) means
 * 'Y'" y su traducción literal («X» significa «Y»), que es igual de vacía para
 * un alumno hispanohablante.
 *
 * Una glosa no deja de serlo porque se le pegue una coletilla detrás: la versión
 * anterior anclaba en `$` y «X» significa «Y»; la opción correcta es la traducción
 * se colaba entera. Por eso se admite una cola, pero solo si habla del ejercicio
 * —opción, respuesta, traducción, elegir— en vez de hablar de la lengua. Ese
 * vocabulario sí es una lista cerrada; el de la lengua no, y exigirlo daba 15
 * falsos positivos sobre explicaciones buenas del banco.
 *
 * Lo que esta regla no puede ver sigue siendo lo de siempre: una explicación
 * vacía que no tenga forma de glosa. Detectar una buena explicación es imposible
 * automáticamente; detectar estas formas concretas, no.
 */
const QUOTED = '[«“"][^»”"]+[»”"]';
const EXERCISE_TALK =
  '(?:[^.;:]*\\b(?:opci[óo]n|opciones|respuesta|correcta?|correcto|traducci[óo]n|elige|elegir|marca(?:r)?|acierta|se pide|encaja)\\b[^.;:]*)';
const GLOSS_TAIL = `(?:\\s*[;,:]?\\s*(?:as[íi] que\\s+)?${EXERCISE_TALK})*`;

const GLOSS_ONLY = [
  new RegExp(`^\\s*\\S+\\s*\\([^)]*\\)\\s*means\\s+['"][^'"]*['"]\\s*\\.?${GLOSS_TAIL}\\s*\\.?\\s*$`, 'i'),
  new RegExp(`^\\s*${QUOTED}\\s+(?:significa|quiere decir)\\s+${QUOTED}\\s*\\.?${GLOSS_TAIL}\\s*\\.?\\s*$`, 'i'),
];

interface ExerciseLike {
  slug: string;
  type: string;
  unit_code?: string;
  prompt?: Record<string, unknown>;
  explanation?: string | null;
  target_word_id?: number | null;
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

  if (Array.isArray(prompt.options)) values.push(...prompt.options.map(String));

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

function isSpanishExplanation(explanation: string | null | undefined): boolean {
  const text = String(explanation ?? '').trim();
  if (!text) return false;

  return /[áéíóúüñ¿¡]/i.test(text) ||
    /\b(el|la|los|las|un|una|unos|unas|se|que|para|por|con|en|del|esta|este|porque|cuando|entre|después|antes|significa|indica|expresa|completa|encaja|relaciona|escucha|escribe|ordena|compara)\b/i.test(text);
}

function hasSameMultiset(left: unknown[], right: unknown[]): boolean {
  const normalize = (value: unknown) => String(value).trim();
  const counts = (values: unknown[]) => {
    const result = new Map<string, number>();
    for (const value of values) {
      const normalized = normalize(value);
      result.set(normalized, (result.get(normalized) ?? 0) + 1);
    }
    return result;
  };

  const leftCounts = counts(left);
  const rightCounts = counts(right);
  if (leftCounts.size !== rightCounts.size) return false;
  for (const [value, count] of leftCounts) {
    if (rightCounts.get(value) !== count) return false;
  }
  return true;
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
  else if (
    context.units &&
    !context.units.some(unit => unit.code === exercise.unit_code && unit.hsk_level === context.max_level)
  ) {
    issues.push({ kind: 'unit_level_mismatch', detail: exercise.unit_code });
  }

  if (!Number.isInteger(exercise.target_word_id) || !context.dictionary.some(
    (entry) => entry.id === exercise.target_word_id && entry.hsk_level <= context.max_level,
  )) {
    issues.push({ kind: 'invalid_target' });
  }

  if (GLOSS_ONLY.some((pattern) => pattern.test(exercise.explanation ?? ''))) {
    issues.push({ kind: 'gloss_not_explanation' });
  }
  if (!isSpanishExplanation(exercise.explanation)) {
    issues.push({ kind: 'explanation_not_spanish' });
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

  if (
    exercise.type === 'reorder' &&
    Array.isArray(prompt.words) &&
    Array.isArray(prompt.correct_order) &&
    !hasSameMultiset(prompt.words, prompt.correct_order)
  ) {
    issues.push({ kind: 'invalid_reorder' });
  }

  for (const token of unknownVocabulary(prompt, allowed)) {
    issues.push({ kind: 'unknown_vocabulary', detail: token });
  }

  for (const token of unknownVocabulary({ sentence: exercise.explanation }, allowed)) {
    issues.push({ kind: 'unknown_vocabulary', detail: token });
  }

  return issues;
}
