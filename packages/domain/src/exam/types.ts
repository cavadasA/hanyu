// Modelo del contenido del simulacro HSK 2 con formato 3.0 (docs/hsk/hsk2-3.0-estructura.md).
// Un grupo es lo que comparte estímulo en el examen: las 3 imágenes de una pregunta de
// L1, las 6 imágenes de L2, el banco de 6 palabras de R2... En las partes de una
// pregunta por estímulo (L1, L3, R4, W2) un grupo reúne varias preguntas seguidas.

export type ExamPartCode = 'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3' | 'R4' | 'W1' | 'W2';

export interface Printed {
  zh: string;
  pinyin: string;
}

export interface ExamLine extends Printed {
  speaker: 'F' | 'M';
}

export type ExamGroup =
  | { part: 'L1'; items: Array<{ audio: ExamLine[]; images: [string, string, string]; answer: 0 | 1 | 2 }> }
  | {
      part: 'L2' | 'R1';
      images: string[];
      example?: { stimulus: ExamLine[] | Printed; answer: number };
      items: Array<{ audio?: ExamLine[]; text?: Printed; answer: number }>;
    }
  | {
      part: 'L3';
      items: Array<{ audio: ExamLine[]; question: ExamLine; options: [Printed, Printed, Printed]; answer: 0 | 1 | 2 }>;
    }
  | { part: 'R2' | 'R3'; bank: Printed[]; example?: { text: Printed; answer: number }; items: Array<{ text: Printed; answer: number }> }
  | {
      part: 'R4';
      items: Array<{ passage: Printed; question: Printed; options: [Printed, Printed, Printed]; answer: 0 | 1 | 2 }>;
    }
  | {
      part: 'W1';
      /** Componentes (亻, 讠, 日…). */
      bank: string[];
      example?: { word: Printed; target_index: 0 | 1; answer: number };
      items: Array<{ word: Printed; target_index: 0 | 1; answer: number }>;
    }
  /** `answer` es un único carácter. */
  | { part: 'W2'; items: Array<{ sentence: Printed; answer: string }> };

export interface ExamForm {
  code: string;
  level: 2;
  groups: Array<ExamGroup & { slug: string }>;
}

export interface ExamGroupShape {
  options: number;
  example_uses: number;
  questions: number;
}

export type ExamAnswerKind = 'image' | 'text' | 'bank' | 'handwrite';

export interface ExamStructurePart {
  code: string;
  question_count: number;
  format: string | null;
  description_es: string;
  answer_kind: ExamAnswerKind;
  has_example: boolean;
  group_shapes: ExamGroupShape[];
  plays?: number;
  instruction_ms?: number;
  pause_between_plays_ms?: number;
  question_gap_ms?: number;
  pause_after_item_ms?: number;
}

export type ExamSectionCode = 'listening' | 'reading' | 'writing';

export interface ExamStructureSection {
  code: ExamSectionCode;
  title: string;
  minutes: number;
  measured_audio_ms?: number;
  parts: ExamStructurePart[];
}

/** Escala oficial de CTI. Hoy no existe para el 3.0 (`official_scale: null`). */
export interface OfficialScale {
  per_section_max: number;
  pass: number;
}

export interface ExamStructure {
  hsk_level: number;
  format_version: string;
  source: string;
  source_note: string;
  total_minutes: number;
  answer_sheet_minutes: number;
  personal_info_minutes: number;
  official_scale: OfficialScale | null;
  sections: ExamStructureSection[];
}

export interface HanziDecomposition {
  /** Descripción IDS de Make Me a Hanzi, p. ej. `⿰亻十`. */
  decomposition: string;
  /** Para cada trazo, la ruta del componente al que pertenece en `decomposition`. */
  matches: Array<number[] | null>;
}

const SECTION_OF: Record<string, ExamSectionCode> = { L: 'listening', R: 'reading', W: 'writing' };

export function examSectionOf(part: ExamPartCode): ExamSectionCode {
  return SECTION_OF[part[0]];
}

/** La entrada de `exam-structure.json` de una parte (`'L2'` → listening, parte `'2'`). */
export function examPartStructure(structure: ExamStructure, part: ExamPartCode): ExamStructurePart {
  const section = structure.sections.find(entry => entry.code === examSectionOf(part));
  const found = section?.parts.find(entry => entry.code === part.slice(1));
  if (!found) {
    throw new Error(`exam-structure.json no declara la parte ${part}`);
  }
  return found;
}

export const EXAM_PART_CODES: ExamPartCode[] = ['L1', 'L2', 'L3', 'R1', 'R2', 'R3', 'R4', 'W1', 'W2'];
