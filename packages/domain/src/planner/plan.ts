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
  | 'no_suitable_content'
  // Hay catálogo, pero no se ha podido resolver su vocabulario. Rankear sin él
  // ordenaría por desempate alfabético fingiendo una decisión que no se tomó.
  | 'content_unavailable'
  | 'no_exam_date'
  | 'daily_limit_reached'
  // La cola de aprendizaje sale de los mazos activos: sin mazo no hay palabras
  // nuevas que ofrecer, y decir que el cupo está agotado sería falso.
  | 'no_deck'
  // Queda cupo hoy, pero los mazos activos no tienen palabras nuevas que dar.
  | 'no_new_words'
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
  /** Tarjetas en los mazos activos. 0 = el usuario aún no ha añadido ningún mazo. */
  deck_size?: number;
  /** Cupo diario de palabras nuevas que queda hoy (ajuste menos introducidas). */
  new_quota_left?: number;
  readings: RankableContent[];
  /** El catálogo existe pero no se ha podido puntuar. Ver `content_unavailable`. */
  readings_unavailable?: boolean;
  exercises: RankableContent[];
  /**
   * La sesión de ejercicios de la unidad activa (Practice → Exercises), con lo
   * hecho hoy. Existe aunque el banco todavía no se rankee: sin esto el paso
   * decía que no había ejercicios.
   */
  unit_exercises?: { completed: number; target: number };
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
  } else if (!activeUnit) {
    steps.push({ kind: 'new_items', status: 'unavailable', reason: 'unit_unavailable' });
  } else if (input.new_allowance <= 0) {
    const reason: PlanStepReason = input.deck_size === 0
      ? 'no_deck'
      : (input.new_quota_left ?? 0) > 0
        ? 'no_new_words'
        : 'daily_limit_reached';
    steps.push({ kind: 'new_items', status: 'unavailable', reason });
  } else {
    const settledItems = activeUnit.settled_items ?? activeUnit.settled_words;
    const totalItems = activeUnit.total_items ?? activeUnit.total_words;
    steps.push({
      kind: 'new_items',
      status: 'ready',
      payload: {
        count: input.new_allowance,
        unit_code: activeUnit.code,
        unit_title: activeUnit.title,
        unit_progress: `${settledItems}/${totalItems}`,
      },
    });
  }

  const reading = best(input.readings, learner);
  steps.push(
    reading
      ? { kind: 'reading', status: 'ready', why: reading.reasons, payload: { id: reading.item.id } }
      : {
          kind: 'reading',
          status: 'unavailable',
          reason: input.readings.length > 0
            ? 'no_suitable_content'
            : input.readings_unavailable
              ? 'content_unavailable'
              : 'no_content',
        },
  );

  const exercise = best(input.exercises, learner);
  steps.push(
    exercise
      ? { kind: 'exercises', status: 'ready', why: exercise.reasons, payload: { id: exercise.item.id } }
      : input.unit_exercises
        ? { kind: 'exercises', status: 'ready', payload: { ...input.unit_exercises } }
        : {
            kind: 'exercises',
            status: 'unavailable',
            reason: input.exercises.length > 0 ? 'no_suitable_content' : 'no_content',
          },
  );

  steps.push(
    input.exam_date
      ? { kind: 'exam', status: 'ready', payload: { exam_date: input.exam_date } }
      : { kind: 'exam', status: 'unavailable', reason: 'no_exam_date' },
  );

  return { steps };
}
