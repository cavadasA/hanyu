// Resultado de un simulacro. El HSK 3.0 no ha publicado escala de puntuación (ni máximo ni
// aprobado), así que el resultado es el porcentaje de aciertos por sección y en total.
// Cuando CTI publique la escala, se rellena `official_scale` en exam-structure.json y
// `official` sale sin tocar este código. Una pregunta sin responder cuenta en el total.
import type { ExamSectionCode, ExamStructure } from './types.ts';

export interface SectionScore {
  correct: number;
  total: number;
  percent: number;
}

export interface ExamScore {
  sections: Record<ExamSectionCode, SectionScore>;
  total_percent: number;
  official: null | { score: number; max: number; passed: boolean };
}

const percent = (correct: number, total: number) => (total === 0 ? 0 : Math.round((100 * correct) / total));

export function scoreExam(correct: Record<ExamSectionCode, number>, structure: ExamStructure): ExamScore {
  const sections = {} as Record<ExamSectionCode, SectionScore>;
  let allCorrect = 0;
  let allTotal = 0;

  for (const section of structure.sections) {
    const total = section.parts.reduce((count, part) => count + part.question_count, 0);
    const hits = correct[section.code];
    if (!Number.isInteger(hits) || hits < 0 || hits > total) {
      throw new Error(`${section.code}: ${hits} aciertos de ${total} preguntas`);
    }
    sections[section.code] = { correct: hits, total, percent: percent(hits, total) };
    allCorrect += hits;
    allTotal += total;
  }

  const scale = structure.official_scale;
  const official = scale
    ? (() => {
        const score = structure.sections.reduce(
          (sum, section) => sum + Math.round((scale.per_section_max * sections[section.code].correct) / sections[section.code].total),
          0,
        );
        return { score, max: scale.per_section_max * structure.sections.length, passed: score >= scale.pass };
      })()
    : null;

  return { sections, total_percent: percent(allCorrect, allTotal), official };
}
