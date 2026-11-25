// Reglas deterministas del contenido del simulacro, una por parte del HSK 2 (formato 3.0).
// Como validateReading y validateGrammarEntry, una lista vacía es la única condición
// para publicar una forma. La forma de cada grupo (cuántas opciones, si hay ejemplo,
// cuántas preguntas) sale de exam-structure.json, no de constantes de aquí.
import { tokenizeReading } from '../reading/tokenize.ts';
import { directComponents } from './components.ts';
import {
  EXAM_PART_CODES,
  examPartStructure,
  type ExamForm,
  type ExamGroup,
  type ExamGroupShape,
  type ExamLine,
  type ExamPartCode,
  type ExamStructure,
  type HanziDecomposition,
  type Printed,
} from './types.ts';

export type ExamIssueKind =
  | 'wrong_count'
  | 'answer_reused'
  | 'answer_out_of_range'
  | 'unknown_vocabulary'
  | 'missing_pinyin'
  | 'blank_missing'
  | 'answers_unbalanced'
  | 'image_unknown'
  | 'component_not_in_character'
  | 'component_ambiguous'
  | 'handwrite_not_allowed'
  | 'handwrite_not_single';

export interface ExamIssue {
  kind: ExamIssueKind;
  group?: string;
  question_index?: number;
  detail?: string;
}

export interface ExamValidationContext {
  /** Diccionario del corpus; se admite hasta HSK 2, como en las lecturas. */
  dictionary: Array<{ hanzi: string; hsk_level: number }>;
  /** Caracteres de escritura (书写字) que el examen puede pedir a mano. */
  handwriting: Set<string>;
  /** Make Me a Hanzi: descomposición y trazos por componente. */
  decomposition: Record<string, HanziDecomposition>;
  structure: ExamStructure;
  /** Claves de los manifiestos de imagen. */
  images: Set<string>;
}

const MAX_LEVEL = 2;
const BLANK = /（\s*）/;
/** En las partes A/B/C ninguna letra puede ser la respuesta de más del 45 % de las preguntas. */
const MAX_LETTER_SHARE = 0.45;
const ABC_PARTS: ExamPartCode[] = ['L1', 'L3', 'R4'];

type Report = (issue: Omit<ExamIssue, 'group'>) => void;

function vocabularyChecker(ctx: ExamValidationContext) {
  const allowed = ctx.dictionary
    .filter(word => word.hsk_level <= MAX_LEVEL)
    .map(word => ({ hanzi: word.hanzi, pinyin: '' }));
  const splittable = allowed.map(word => Array.from(word.hanzi)).filter(chars => chars.length === 2);

  /**
   * Un verbo separable del nivel (睡觉) se parte con palabras en medio: sus mitades
   * cuentan como vocabulario cuando la otra mitad está en su sitio (misma regla
   * que la gramática).
   */
  const isSplitHalf = (sentence: string, offset: number, text: string) =>
    splittable.some(([first, second]) =>
      (text === first && sentence.indexOf(second, offset + text.length) !== -1) ||
      (text === second && offset > 0 && sentence.lastIndexOf(first, offset - 1) !== -1),
    );

  return (zh: string, report: Report, question_index?: number) => {
    let offset = 0;
    for (const token of tokenizeReading(zh, allowed)) {
      if (token.type === 'unknown' && !isSplitHalf(zh, offset, token.text)) {
        report({ kind: 'unknown_vocabulary', question_index, detail: token.text });
      }
      offset += token.text.length;
    }
  };
}

function checkPrinted(
  texts: Printed[],
  report: Report,
  vocabulary: ReturnType<typeof vocabularyChecker>,
  question_index?: number,
) {
  for (const text of texts) {
    if (!text.pinyin?.trim()) {
      report({ kind: 'missing_pinyin', question_index, detail: text.zh });
    }
    vocabulary(text.zh, report, question_index);
  }
}

/** Respuestas de un grupo con banco u opciones compartidas: en rango y cada una una sola vez. */
function checkSharedAnswers(answers: number[], options: number, report: Report, hasExample: boolean) {
  const seen = new Map<number, number>();
  answers.forEach((answer, position) => {
    // Con ejemplo, la posición 0 es el ejemplo; las preguntas empiezan en 0 después.
    const question_index = hasExample ? (position === 0 ? undefined : position - 1) : position;
    if (!Number.isInteger(answer) || answer < 0 || answer >= options) {
      report({ kind: 'answer_out_of_range', question_index, detail: String(answer) });
      return;
    }
    if (seen.has(answer)) {
      report({ kind: 'answer_reused', question_index, detail: String(answer) });
    }
    seen.set(answer, position);
  });
}

function shapeFor(group: { example?: unknown }, part: ExamPartCode, ctx: ExamValidationContext): ExamGroupShape | null {
  const usesExample = group.example ? 1 : 0;
  return examPartStructure(ctx.structure, part).group_shapes.find(shape => shape.example_uses === usesExample) ?? null;
}

function checkShape(
  group: { example?: unknown; items: unknown[] },
  part: ExamPartCode,
  options: number,
  ctx: ExamValidationContext,
  report: Report,
): void {
  const shape = shapeFor(group, part, ctx);
  if (!shape) {
    report({ kind: 'wrong_count', detail: `${part}: ningún grupo de la estructura ${group.example ? 'lleva' : 'va sin'} ejemplo` });
    return;
  }
  if (options !== shape.options) {
    report({ kind: 'wrong_count', detail: `${part}: ${options} opciones, la estructura pide ${shape.options}` });
  }
  if (group.items.length !== shape.questions) {
    report({ kind: 'wrong_count', detail: `${part}: ${group.items.length} preguntas, la estructura pide ${shape.questions}` });
  }
}

function checkImages(keys: string[], ctx: ExamValidationContext, report: Report, question_index?: number) {
  for (const key of keys) {
    if (!ctx.images.has(key)) {
      report({ kind: 'image_unknown', question_index, detail: key });
    }
  }
}

function checkAbc(answer: number, report: Report, question_index: number) {
  if (answer !== 0 && answer !== 1 && answer !== 2) {
    report({ kind: 'answer_out_of_range', question_index, detail: String(answer) });
  }
}

const lines = (audio: ExamLine[] | undefined): Printed[] => audio ?? [];
const fill = (text: string, word: string) => text.replace(BLANK, word);

export function validateExamGroup(group: ExamGroup, ctx: ExamValidationContext): ExamIssue[] {
  const issues: ExamIssue[] = [];
  const report: Report = issue => issues.push(issue);
  const vocabulary = vocabularyChecker(ctx);

  switch (group.part) {
    case 'L1': {
      if (group.example) {
        checkImages(group.example.images, ctx, report);
        checkPrinted(group.example.audio, report, vocabulary);
      }
      group.items.forEach((item, index) => {
        if (item.images.length !== examPartStructure(ctx.structure, 'L1').group_shapes[0].options) {
          report({ kind: 'wrong_count', question_index: index, detail: `${item.images.length} imágenes` });
        }
        checkImages(item.images, ctx, report, index);
        checkPrinted(item.audio, report, vocabulary, index);
        checkAbc(item.answer, report, index);
      });
      break;
    }
    case 'L2':
    case 'R1': {
      checkShape(group, group.part, group.images.length, ctx, report);
      checkImages(group.images, ctx, report);
      if (group.example) {
        const stimulus = group.example.stimulus;
        checkPrinted(Array.isArray(stimulus) ? stimulus : [stimulus], report, vocabulary);
      }
      group.items.forEach((item, index) => {
        checkPrinted([...lines(item.audio), ...(item.text ? [item.text] : [])], report, vocabulary, index);
      });
      checkSharedAnswers(
        [...(group.example ? [group.example.answer] : []), ...group.items.map(item => item.answer)],
        group.images.length,
        report,
        Boolean(group.example),
      );
      break;
    }
    case 'L3': {
      if (group.example) {
        const example = group.example;
        checkPrinted([...example.audio, example.question, ...example.options], report, vocabulary);
      }
      group.items.forEach((item, index) => {
        if (item.options.length !== 3) {
          report({ kind: 'wrong_count', question_index: index, detail: `${item.options.length} opciones` });
        }
        checkPrinted([...item.audio, item.question, ...item.options], report, vocabulary, index);
        checkAbc(item.answer, report, index);
      });
      break;
    }
    case 'R2':
    case 'R3': {
      checkShape(group, group.part, group.bank.length, ctx, report);
      checkPrinted(group.bank, report, vocabulary);
      const entries = [...(group.example ? [group.example] : []), ...group.items];
      entries.forEach((entry, position) => {
        const question_index = group.example ? (position === 0 ? undefined : position - 1) : position;
        if (!entry.text.pinyin?.trim()) {
          report({ kind: 'missing_pinyin', question_index, detail: entry.text.zh });
        }
        if (group.part === 'R2') {
          if (!BLANK.test(entry.text.zh)) {
            report({ kind: 'blank_missing', question_index });
            return;
          }
          vocabulary(fill(entry.text.zh, group.bank[entry.answer]?.zh ?? ''), report, question_index);
        } else {
          vocabulary(entry.text.zh, report, question_index);
        }
      });
      checkSharedAnswers(entries.map(entry => entry.answer), group.bank.length, report, Boolean(group.example));
      break;
    }
    case 'R4': {
      group.items.forEach((item, index) => {
        if (item.options.length !== 3) {
          report({ kind: 'wrong_count', question_index: index, detail: `${item.options.length} opciones` });
        }
        checkPrinted([item.passage, item.question, ...item.options], report, vocabulary, index);
        checkAbc(item.answer, report, index);
      });
      break;
    }
    case 'W1': {
      checkShape(group, 'W1', group.bank.length, ctx, report);
      const entries = [...(group.example ? [group.example] : []), ...group.items];
      entries.forEach((entry, position) => {
        const question_index = group.example ? (position === 0 ? undefined : position - 1) : position;
        checkPrinted([entry.word], report, vocabulary, question_index);
        const target = Array.from(entry.word.zh)[entry.target_index];
        const component = group.bank[entry.answer];
        if (!target || component === undefined) {
          return;
        }
        const decomposition = ctx.decomposition[target]?.decomposition ?? '';
        // Solo cuentan los hijos directos: es lo que incompleteCharacterSvg sabe quitar.
        const occurrences = directComponents(decomposition).filter(part => part === component).length;
        if (occurrences === 0) {
          report({ kind: 'component_not_in_character', question_index, detail: `${component} ∉ ${target}` });
        } else if (occurrences > 1) {
          report({ kind: 'component_ambiguous', question_index, detail: `${component} ×${occurrences} en ${target}` });
        }
      });
      checkSharedAnswers(entries.map(entry => entry.answer), group.bank.length, report, Boolean(group.example));
      break;
    }
    case 'W2': {
      group.items.forEach((item, index) => {
        if (!item.sentence.pinyin?.trim()) {
          report({ kind: 'missing_pinyin', question_index: index, detail: item.sentence.zh });
        }
        if (!BLANK.test(item.sentence.zh)) {
          report({ kind: 'blank_missing', question_index: index });
        }
        if (Array.from(item.answer).length !== 1) {
          report({ kind: 'handwrite_not_single', question_index: index, detail: item.answer });
        } else if (!ctx.handwriting.has(item.answer)) {
          report({ kind: 'handwrite_not_allowed', question_index: index, detail: item.answer });
        }
        vocabulary(fill(item.sentence.zh, item.answer), report, index);
      });
      break;
    }
  }

  return issues;
}

function answersOf(group: ExamGroup): number[] {
  return group.part === 'W2' ? [] : group.items.map(item => item.answer);
}

export function validateExamForm(form: ExamForm, ctx: ExamValidationContext): ExamIssue[] {
  const issues: ExamIssue[] = form.groups.flatMap(group =>
    validateExamGroup(group, ctx).map(issue => ({ ...issue, group: group.slug })),
  );

  for (const part of EXAM_PART_CODES) {
    const expected = examPartStructure(ctx.structure, part);
    const groups = form.groups.filter(group => group.part === part);
    const questions = groups.reduce((count, group) => count + group.items.length, 0);
    if (questions !== expected.question_count) {
      issues.push({ kind: 'wrong_count', detail: `${part}: ${questions} preguntas, la estructura pide ${expected.question_count}` });
    }
    const shared = expected.group_shapes.some(shape => shape.questions > 1);
    if (shared && groups.length !== expected.group_shapes.length) {
      issues.push({ kind: 'wrong_count', detail: `${part}: ${groups.length} grupos, la estructura pide ${expected.group_shapes.length}` });
    }

    if (ABC_PARTS.includes(part)) {
      const answers = groups.flatMap(answersOf);
      for (const letter of [0, 1, 2]) {
        const share = answers.filter(answer => answer === letter).length / Math.max(answers.length, 1);
        if (share > MAX_LETTER_SHARE) {
          issues.push({
            kind: 'answers_unbalanced',
            group: groups.map(group => group.slug).join(','),
            detail: `${part}: ${'ABC'[letter]} en el ${Math.round(share * 100)} %`,
          });
        }
      }
    }
  }

  return issues;
}
