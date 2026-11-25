// Reglas deterministas. Ninguna usa un modelo: si una regla necesitase juicio
// no sería un validador sino una revisión, y ésa la hace quien mira el diff.
// Una lista vacía de problemas es la única condición para publicar.
import type { DictionaryEntry } from './tokenize.ts';
import { vocabularyFindings } from './vocabulary.ts';

export type IssueKind =
  | 'unknown_vocabulary'
  | 'word_above_level'
  | 'missing_pinyin'
  | 'missing_translation'
  | 'unsegmented'
  | 'too_short'
  | 'too_long'
  | 'answers_not_spread'
  | 'missing_evidence'
  | 'duplicate_options'
  | 'target_absent'
  | 'unknown_grammar'
  | 'no_questions'
  | 'inference_needs_two'
  | 'inference_is_literal'
  | 'rationale_missing'
  | 'inference_not_last'
  | 'no_inferential';

export interface ValidationIssue {
  kind: IssueKind;
  detail?: string;
  sentence_index?: number;
  question_index?: number;
}

export interface ReadingSentence {
  zh: string;
  pinyin: string;
  es: string;
}

interface QuestionBase {
  prompt: string;
  options: string[];
  answer_index: number;
}

/** Las preguntas sin `kind` (todas las anteriores al Plan 14) son literales. */
export interface LiteralQuestion extends QuestionBase {
  kind?: 'literal';
  /** Índice de la frase que justifica la respuesta. */
  evidence_sentence: number;
}

/**
 * La respuesta no está escrita en el texto: se deduce combinando frases.
 * `rationale_es` explica la deducción y se muestra después de responder.
 */
export interface InferentialQuestion extends QuestionBase {
  kind: 'inferential';
  evidence_sentences: number[];
  rationale_es: string;
}

export type ReadingQuestion = LiteralQuestion | InferentialQuestion;

export interface ReadingGrammarTarget {
  code: string;
  level: number;
}

export interface ReadingSource {
  slug: string;
  title: string;
  hsk_level: number;
  format: string;
  topic: string;
  sentences: ReadingSentence[];
  target_words: string[];
  target_grammar: ReadingGrammarTarget[];
  questions: ReadingQuestion[];
}

export interface ValidationContext {
  /** Todo el diccionario HSK 1–3: el nivel de cada palabra lo decide max_level. */
  dictionary: (DictionaryEntry & { hsk_level: number })[];
  max_level: number;
  target_word_ids: number[];
  grammar_points: Array<{ code: string; hsk_level: number }>;
  /**
   * Nombres de los personajes de la serie de la lectura. Se aceptan en el
   * texto, pero no son vocabulario: no sirven como palabra objetivo.
   */
  proper_nouns?: string[];
  /** El corpus se declara terminado: cuentan también las reglas de completitud. */
  complete?: boolean;
}

/**
 * Longitud por nivel, en caracteres. Los mínimos existen porque un texto corto
 * no da contexto suficiente para inferir nada.
 */
const LENGTH = {
  1: { min: 40, max: 120 },
  2: { min: 80, max: 220 },
  3: { min: 150, max: 400 },
} as const;

const SENTENCE_END = /[。！？…]$/;

/** Menos que esto no explica una deducción; como mucho la repite. */
const MIN_RATIONALE_LENGTH = 20;

export function validateReading(
  reading: ReadingSource,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const allowedForms = new Set(
    context.dictionary.filter(entry => entry.hsk_level <= context.max_level).map(entry => entry.hanzi),
  );

  reading.sentences.forEach((sentence, index) => {
    if (!sentence.pinyin.trim()) {
      issues.push({ kind: 'missing_pinyin', sentence_index: index });
    }
    if (!sentence.es.trim()) {
      issues.push({ kind: 'missing_translation', sentence_index: index });
    }
    if (!SENTENCE_END.test(sentence.zh.trim())) {
      issues.push({ kind: 'unsegmented', sentence_index: index });
    }

    // El diccionario completo (HSK 1–3), como el tokenizador del móvil.
    for (const finding of vocabularyFindings(sentence.zh, context.dictionary, context.max_level, context.proper_nouns)) {
      issues.push(
        finding.kind === 'word_above_level'
          ? { kind: 'word_above_level', detail: `${finding.text} (HSK ${finding.level})`, sentence_index: index }
          : { kind: 'unknown_vocabulary', detail: finding.text, sentence_index: index },
      );
    }
  });

  const text = reading.sentences.map(sentence => sentence.zh).join('');
  const length = [...text].filter(character => !/[。！？…，、；："'（）]/.test(character)).length;
  const bounds = LENGTH[reading.hsk_level as 1 | 2 | 3] ?? LENGTH[2];

  if (length < bounds.min) {
    issues.push({ kind: 'too_short', detail: `${length} < ${bounds.min}` });
  }
  if (length > bounds.max) {
    issues.push({ kind: 'too_long', detail: `${length} > ${bounds.max}` });
  }

  for (const target of reading.target_words) {
    if (!text.includes(target)) {
      issues.push({ kind: 'target_absent', detail: target });
    }
    if (!allowedForms.has(target)) {
      issues.push({ kind: 'unknown_vocabulary', detail: target });
    }
  }

  for (const target of reading.target_grammar) {
    const code = typeof target?.code === 'string' ? target.code : '';
    const level = target?.level;
    const known = typeof level === 'number' && Number.isInteger(level) &&
      level >= 1 && level <= context.max_level &&
      context.grammar_points.some(point => point.code === code && point.hsk_level === level);

    if (!known) {
      issues.push({
        kind: 'unknown_grammar',
        detail: code ? `${code}@${String(target?.level)}` : 'invalid target',
      });
    }
  }

  if (reading.questions.length === 0) {
    issues.push({ kind: 'no_questions' });
  }

  const exists = (sentence: number) =>
    Number.isInteger(sentence) && sentence >= 0 && sentence < reading.sentences.length;

  reading.questions.forEach((question, index) => {
    if (new Set(question.options).size !== question.options.length) {
      issues.push({ kind: 'duplicate_options', question_index: index });
    }

    if (question.kind !== 'inferential') {
      if (!exists(question.evidence_sentence)) {
        issues.push({ kind: 'missing_evidence', question_index: index });
      }
      // Los ids de pregunta son su posición: una literal detrás de una
      // inferencial movería las respuestas ya guardadas de los alumnos.
      if (reading.questions.slice(0, index).some(previous => previous.kind === 'inferential')) {
        issues.push({ kind: 'inference_not_last', question_index: index });
      }
      return;
    }

    const evidence = question.evidence_sentences ?? [];
    if (new Set(evidence).size < 2) {
      issues.push({ kind: 'inference_needs_two', question_index: index });
    } else if (!evidence.every(exists)) {
      issues.push({ kind: 'missing_evidence', question_index: index });
    }

    // Si la respuesta está escrita tal cual en el texto, basta con buscarla:
    // es una pregunta literal aunque se declare inferencial.
    const answer = question.options[question.answer_index] ?? '';
    if (answer && reading.sentences.some(sentence => sentence.zh.includes(answer))) {
      issues.push({ kind: 'inference_is_literal', question_index: index, detail: answer });
    }

    if ((question.rationale_es ?? '').trim().length < MIN_RATIONALE_LENGTH) {
      issues.push({ kind: 'rationale_missing', question_index: index });
    }
  });

  if (context.complete && !reading.questions.some(question => question.kind === 'inferential')) {
    issues.push({ kind: 'no_inferential' });
  }

  // Con tres o más preguntas, tenerlas todas en la misma opción o seguir una
  // secuencia fija convierte el cuestionario en un test predecible.
  if (reading.questions.length >= 3) {
    const answerIndexes = reading.questions.map(question => question.answer_index);
    const positions = new Set(answerIndexes);
    const sequential = answerIndexes.every((answer, index) => answer === index);
    if (positions.size === 1 || sequential) {
      issues.push({ kind: 'answers_not_spread' });
    }
  }

  return issues;
}
