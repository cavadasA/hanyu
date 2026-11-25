// packages/domain/src/expression/validate-task.ts
//
// Una tarea comunicativa entra en el corpus solo si su respuesta modelo aprueba
// las mismas reglas que se aplicarán al alumno. Un enunciado que su propia
// respuesta no supera es un ejercicio que nadie puede aprobar.
import {
  checkAnswerRules,
  markerSegments,
  type CommunicativeContext,
  type CommunicativeTask,
} from './check-answer.ts';

export type TaskIssueKind =
  | 'invalid_slug'
  | 'invalid_level'
  | 'invalid_mode'
  | 'missing_situation'
  | 'missing_intent'
  | 'missing_markers'
  | 'unknown_grammar_point'
  | 'grammar_above_level'
  | 'unusable_marker'
  | 'invalid_length_bounds'
  | 'missing_model_answer'
  | 'model_answer_fails';

export interface TaskIssue {
  kind: TaskIssueKind;
  detail?: string;
}

const SLUG = /^([1-3])-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCommunicativeTask(
  task: CommunicativeTask,
  ctx: CommunicativeContext,
): TaskIssue[] {
  const issues: TaskIssue[] = [];

  if (![1, 2, 3].includes(task.hsk_level)) {
    issues.push({ kind: 'invalid_level', detail: String(task.hsk_level) });
  }
  const slug = SLUG.exec(task.slug);
  if (!slug || Number(slug[1]) !== task.hsk_level) {
    issues.push({ kind: 'invalid_slug', detail: task.slug });
  }
  if (task.mode !== 'write' && task.mode !== 'speak') {
    issues.push({ kind: 'invalid_mode', detail: String(task.mode) });
  }
  if (!task.situation_es?.trim()) {
    issues.push({ kind: 'missing_situation' });
  }
  if (!Array.isArray(task.intent) || task.intent.length === 0 || task.intent.some((i) => !i?.trim())) {
    issues.push({ kind: 'missing_intent' });
  }
  if (!Number.isInteger(task.min_chars) || !Number.isInteger(task.max_chars)
    || task.min_chars < 1 || task.min_chars > task.max_chars) {
    issues.push({ kind: 'invalid_length_bounds', detail: `${task.min_chars}–${task.max_chars}` });
  }
  const answer = task.model_answer;
  if (!answer?.zh?.trim() || !answer.pinyin?.trim() || !answer.es?.trim()) {
    issues.push({ kind: 'missing_model_answer' });
  }

  if (!Array.isArray(task.required_markers) || task.required_markers.length === 0) {
    issues.push({ kind: 'missing_markers' });
  } else {
    for (const required of task.required_markers) {
      const ref = `${required.hsk_level}-${required.code}`;
      const point = ctx.grammar_points.find(
        (candidate) => candidate.hsk_level === required.hsk_level && candidate.code === required.code,
      );
      if (!point) {
        issues.push({ kind: 'unknown_grammar_point', detail: ref });
      } else if (point.hsk_level > task.hsk_level) {
        issues.push({ kind: 'grammar_above_level', detail: ref });
      } else if (!point.markers.some((marker) => markerSegments(marker).length > 0)) {
        issues.push({ kind: 'unusable_marker', detail: ref });
      }
    }
  }

  // Si el enunciado ya está roto, comprobar la respuesta modelo contra él solo
  // repetiría el mismo error con otro nombre.
  if (issues.length === 0) {
    const result = checkAnswerRules(answer.zh, task, ctx);
    for (const reason of result.reasons) {
      issues.push({ kind: 'model_answer_fails', detail: reason });
    }
  }

  return issues;
}
