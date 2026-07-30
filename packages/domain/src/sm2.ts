export type CardStatus = 'new' | 'learning' | 'review' | 'mastered';

export interface ReviewState {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  status: CardStatus;
  next_review_at: string;
}

export interface ReviewInput {
  state: ReviewState;
  quality: number;
  reviewed_at: string;
}

export interface ReviewOutcome extends ReviewState {
  last_reviewed_at: string;
}

export function applySm2(input: ReviewInput): ReviewOutcome {
  const { state, quality, reviewed_at } = input;

  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new Error('quality must be an integer between 0 and 5');
  }

  let repetitions = state.repetitions;
  let intervalDays = state.interval_days;
  const easeBeforeUpdate = state.ease_factor;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeBeforeUpdate);
    }
    repetitions = repetitions + 1;
  }

  let easeFactor =
    easeBeforeUpdate + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  easeFactor = Math.max(1.3, easeFactor);
  easeFactor = Math.round(easeFactor * 100) / 100;

  const next = new Date(`${reviewed_at.slice(0, 10)}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + intervalDays);
  const nextReviewAt = next.toISOString();

  let status: CardStatus;
  if (quality < 3) {
    status = 'learning';
  } else if (repetitions === 1) {
    status = 'learning';
  } else if (intervalDays >= 21 && repetitions >= 5) {
    status = 'mastered';
  } else {
    status = 'review';
  }

  return {
    ease_factor: easeFactor,
    interval_days: intervalDays,
    repetitions,
    status,
    next_review_at: nextReviewAt,
    last_reviewed_at: reviewed_at,
  };
}
