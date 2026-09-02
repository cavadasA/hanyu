import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type FSRSParameters,
  type Grade as FsrsGrade,
} from 'ts-fsrs';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type SchedulingPhase = 'new' | 'learning' | 'review' | 'relearning';

export interface SchedulingState {
  difficulty: number;
  stability: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  scheduled_days: number;
  elapsed_days: number;
  state: SchedulingPhase;
  due: string;
  last_review: string | null;
}

const GRADE_TO_RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const PHASE_TO_STATE: Record<SchedulingPhase, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_TO_PHASE: Record<State, SchedulingPhase> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

export const GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];

export function emptyState(now: Date): SchedulingState {
  return fromCard(createEmptyCard(now));
}

function toCard(state: SchedulingState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: PHASE_TO_STATE[state.state],
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  };
}

function fromCard(card: Card): SchedulingState {
  return {
    difficulty: card.difficulty,
    stability: card.stability,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    scheduled_days: card.scheduled_days,
    elapsed_days: card.elapsed_days,
    state: STATE_TO_PHASE[card.state],
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

export function applyReview(
  state: SchedulingState,
  grade: Grade,
  now: Date,
  params: FSRSParameters,
): { state: SchedulingState; interval_minutes: number } {
  const { card } = fsrs(params).next(toCard(state), now, GRADE_TO_RATING[grade]);

  return { state: fromCard(card), interval_minutes: minutesBetween(now, card.due) };
}

export function previewIntervals(
  state: SchedulingState,
  now: Date,
  params: FSRSParameters,
): Record<Grade, number> {
  const preview = fsrs(params).repeat(toCard(state), now);

  return {
    again: minutesBetween(now, preview[Rating.Again].card.due),
    hard: minutesBetween(now, preview[Rating.Hard].card.due),
    good: minutesBetween(now, preview[Rating.Good].card.due),
    easy: minutesBetween(now, preview[Rating.Easy].card.due),
  };
}

export function retrievability(
  state: SchedulingState,
  now: Date,
  params: FSRSParameters,
): number {
  return fsrs(params).get_retrievability(toCard(state), now, false);
}
