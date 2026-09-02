// La única regla que decide si una respuesta es correcta. Vive en
// packages/domain, sin dependencias, para que pueda ejecutarse tal cual dentro
// de una Edge Function de Deno el día que la comprobación necesite autoridad
// de servidor. Hoy corre en el cliente, a propósito: los ejercicios tienen que
// funcionar sin conexión.
import type { ExerciseAnswer, ExerciseSolution } from './contract';
import { normalizeHanzi, normalizePinyinInput, normalizeText } from './normalize';

export type EvaluationDetail =
  | { kind: 'matching'; wrong: string[]; missing: string[] }
  | { kind: 'reorder'; first_wrong_index: number | null }
  | { kind: 'simple' };

export interface Evaluation {
  correct: boolean;
  solution: ExerciseSolution;
  answer: ExerciseAnswer;
  detail: EvaluationDetail;
}

export function isAnswerComplete(
  solution: ExerciseSolution,
  answer: ExerciseAnswer,
): boolean {
  if (solution.kind !== answer.kind) {
    return false;
  }

  switch (answer.kind) {
    case 'fill_blank':
    case 'dictation':
      return answer.text.trim().length > 0;
    case 'multiple_choice':
      return answer.option.trim().length > 0;
    case 'reorder':
      // Media frase no es una respuesta: comprobarla solo enseña que falta
      // algo, que el usuario ya sabe.
      return (
        solution.kind === 'reorder' && answer.tokens.length === solution.order.length
      );
    case 'matching':
      return (
        solution.kind === 'matching' &&
        Object.keys(answer.pairs).length === Object.keys(solution.pairs).length
      );
  }
}

function evaluationOf(
  correct: boolean,
  solution: ExerciseSolution,
  answer: ExerciseAnswer,
  detail: EvaluationDetail = { kind: 'simple' },
): Evaluation {
  return { correct, solution, answer, detail };
}

export function evaluateAnswer(
  solution: ExerciseSolution,
  answer: ExerciseAnswer,
): Evaluation {
  // Un desajuste de tipo es un error de programación, no del usuario. Se
  // devuelve incorrecto en vez de lanzar: una sesión de estudio no debe caerse
  // por un ejercicio mal formado.
  if (solution.kind !== answer.kind) {
    return evaluationOf(false, solution, answer);
  }

  switch (solution.kind) {
    case 'fill_blank': {
      const submitted = normalizeText((answer as { text: string }).text);
      const correct = solution.accept.some((option) => normalizeText(option) === submitted);
      return evaluationOf(correct, solution, answer);
    }

    case 'multiple_choice': {
      const submitted = normalizeText((answer as { option: string }).option);
      return evaluationOf(normalizeText(solution.correct) === submitted, solution, answer);
    }

    case 'reorder': {
      const tokens = (answer as { tokens: string[] }).tokens;
      let firstWrong: number | null = null;

      for (let index = 0; index < Math.max(tokens.length, solution.order.length); index += 1) {
        if (normalizeHanzi(tokens[index] ?? '') !== normalizeHanzi(solution.order[index] ?? '')) {
          firstWrong = index;
          break;
        }
      }

      return evaluationOf(firstWrong === null, solution, answer, {
        kind: 'reorder',
        first_wrong_index: firstWrong,
      });
    }

    case 'dictation': {
      const text = (answer as { text: string }).text;
      const asHanzi = normalizeHanzi(text) === normalizeHanzi(solution.hanzi);
      const asPinyin =
        solution.pinyin !== null &&
        normalizePinyinInput(text) === normalizePinyinInput(solution.pinyin);

      return evaluationOf(asHanzi || asPinyin, solution, answer);
    }

    case 'matching': {
      const submitted = (answer as { pairs: Record<string, string> }).pairs;
      const wrong: string[] = [];
      const missing: string[] = [];

      for (const [left, right] of Object.entries(solution.pairs)) {
        if (!(left in submitted)) {
          missing.push(left);
          continue;
        }
        if (normalizeText(submitted[left]) !== normalizeText(right)) {
          wrong.push(left);
        }
      }

      return evaluationOf(wrong.length === 0 && missing.length === 0, solution, answer, {
        kind: 'matching',
        wrong,
        missing,
      });
    }
  }
}
