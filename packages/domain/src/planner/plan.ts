//
// El orden de decisión de la auditoría, con los pasos que todavía no tienen
// material devolviendo `unavailable` y su motivo. Declarar el hueco es
// información; taparlo con contenido de relleno sería una mentira, y omitir el
// paso escondería que falta trabajo por hacer.
import { rankContent, type LearnerModel, type RankableContent, type RankReason } from './rank';

export type PlanStepKind =
  | 'reviews'
  | 'relearning'
  | 'new_items'
  | 'reading'
  | 'exercises'
  | 'exam';

export type PlanStepReason =
  | 'nothing_due'
  | 'no_content'
  | 'no_exam_date'
  | 'daily_limit_reached'
  | 'unit_unavailable';

export interface PlanStep {
  kind: PlanStepKind;
  status: 'ready' | 'unavailable';
  reason?: PlanStepReason;
  why?: RankReason[];
  payload?: Record<string, unknown>;
}

export interface DailyPlanInput {
  due_reviews: number;
  relearning: number;
  review_completed?: number;
  review_target?: number;
  active_unit: {
    code: string;
    title: string;
    total_words: number;
    settled_words: number;
    hsk_level?: number;
    word_count?: number;
    pattern_count?: number;
    grammar_id?: number;
    total_items?: number;
    settled_items?: number;
  } | null;
  new_allowance: number;
  readings: RankableContent[];
  exercises: RankableContent[];
  exam_date: string | null;
  learner?: LearnerModel;
}

const EMPTY_LEARNER: LearnerModel = {
  target_word_ids: [],
  known_word_ids: [],
  recent_content_ids: [],
  covered_topics: [],
};

function best(items: RankableContent[], learner: LearnerModel) {
  let winner: { item: RankableContent; value: number; reasons: RankReason[] } | null = null;

  for (const item of items) {
    const { value, reasons } = rankContent(item, learner);
    if (
      !winner ||
      value > winner.value ||
      (value === winner.value && item.id.localeCompare(winner.item.id) < 0)
    ) {
      winner = { item, value, reasons };
    }
  }

  return winner && winner.value > 0 ? winner : null;
}

export function buildDailyPlan(input: DailyPlanInput): { steps: PlanStep[] } {
  const learner = input.learner ?? EMPTY_LEARNER;
  const steps: PlanStep[] = [];

  steps.push(
    input.due_reviews > 0
      ? {
          kind: 'reviews',
          status: 'ready',
          payload: {
            count: input.due_reviews,
            completed: input.review_completed ?? 0,
            target: input.review_target ?? input.due_reviews,
          },
        }
      : { kind: 'reviews', status: 'unavailable', reason: 'nothing_due' },
  );

  steps.push(
    input.relearning > 0
      ? { kind: 'relearning', status: 'ready', payload: { count: input.relearning } }
      : { kind: 'relearning', status: 'unavailable', reason: 'nothing_due' },
  );

  const activeUnit = input.active_unit;
  const grammarPractice = activeUnit?.grammar_id != null && (
    activeUnit.word_count === 0 ||
    (activeUnit.pattern_count ?? 0) > 0 && activeUnit.settled_words >= activeUnit.total_words
  );
  if (grammarPractice) {
    steps.push({
      kind: 'new_items',
      status: 'ready',
      payload: {
        grammar_id: activeUnit.grammar_id,
        grammar_only: true,
        unit_code: activeUnit.code,
        unit_title: activeUnit.title,
        unit_level: activeUnit.hsk_level,
        unit_progress: `${activeUnit.settled_items ?? 0}/${activeUnit.total_items ?? 1}`,
      },
    });
  } else if (input.new_allowance <= 0) {
    steps.push({ kind: 'new_items', status: 'unavailable', reason: 'daily_limit_reached' });
  } else if (!input.active_unit) {
    steps.push({ kind: 'new_items', status: 'unavailable', reason: 'unit_unavailable' });
  } else {
    steps.push({
      kind: 'new_items',
      status: 'ready',
      payload: {
        count: input.new_allowance,
        unit_code: input.active_unit.code,
        unit_title: input.active_unit.title,
        unit_progress: `${input.active_unit.settled_words}/${input.active_unit.total_words}`,
      },
    });
  }

  const reading = best(input.readings, learner);
  steps.push(
    reading
      ? { kind: 'reading', status: 'ready', why: reading.reasons, payload: { id: reading.item.id } }
      : { kind: 'reading', status: 'unavailable', reason: 'no_content' },
  );

  const exercise = best(input.exercises, learner);
  steps.push(
    exercise
      ? { kind: 'exercises', status: 'ready', why: exercise.reasons, payload: { id: exercise.item.id } }
      : { kind: 'exercises', status: 'unavailable', reason: 'no_content' },
  );

  steps.push(
    input.exam_date
      ? { kind: 'exam', status: 'ready', payload: { exam_date: input.exam_date } }
      : { kind: 'exam', status: 'unavailable', reason: 'no_exam_date' },
  );

  return { steps };
}
