// Reglas deterministas. Ninguna usa un modelo: si una regla necesitase juicio
// no sería un validador sino una revisión, y ésa la hace quien mira el diff.
// Una lista vacía de problemas es la única condición para publicar.
import { tokenizeReading, type DictionaryEntry } from './tokenize';

export type IssueKind =
  | 'unknown_vocabulary'
  | 'missing_pinyin'
  | 'missing_translation'
  | 'unsegmented'
  | 'too_short'
  | 'too_long'
  | 'answers_not_spread'
  | 'missing_evidence'
  | 'duplicate_options'
  | 'target_absent'
  | 'no_questions';

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

export interface ReadingQuestion {
  prompt: string;
  options: string[];
  answer_index: number;
  /** Índice de la frase que justifica la respuesta. */
  evidence_sentence: number;
}

export interface ReadingSource {
  slug: string;
  title: string;
  hsk_level: number;
  format: string;
  topic: string;
  sentences: ReadingSentence[];
  target_words: string[];
  target_grammar: string[];
  questions: ReadingQuestion[];
}

export interface ValidationContext {
  dictionary: (DictionaryEntry & { hsk_level: number })[];
  max_level: number;
  target_word_ids: number[];
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

export function validateReading(
  reading: ReadingSource,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const allowed = context.dictionary.filter(entry => entry.hsk_level <= context.max_level);
  const allowedForms = new Set(allowed.map(entry => entry.hanzi));

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

    for (const token of tokenizeReading(sentence.zh, allowed)) {
      if (token.type === 'unknown') {
        issues.push({ kind: 'unknown_vocabulary', detail: token.text, sentence_index: index });
      }
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

  if (reading.questions.length === 0) {
    issues.push({ kind: 'no_questions' });
  }

  reading.questions.forEach((question, index) => {
    if (new Set(question.options).size !== question.options.length) {
      issues.push({ kind: 'duplicate_options', question_index: index });
    }
    if (
      question.evidence_sentence < 0 ||
      question.evidence_sentence >= reading.sentences.length
    ) {
      issues.push({ kind: 'missing_evidence', question_index: index });
    }
  });

  // Con tres o más preguntas, tenerlas todas en la misma opción convierte el
  // cuestionario en un test de pulsar siempre A.
  if (reading.questions.length >= 3) {
    const positions = new Set(reading.questions.map(question => question.answer_index));
    if (positions.size === 1) {
      issues.push({ kind: 'answers_not_spread' });
    }
  }

  return issues;
}
