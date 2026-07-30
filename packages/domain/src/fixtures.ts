import type { ReviewInput, ReviewOutcome } from './sm2';

export interface Sm2Fixture {
  name: string;
  input: ReviewInput;
  expected: ReviewOutcome;
}

export const SM2_FIXTURES: Sm2Fixture[] = [
  {
    name: 'failure resets repetitions and interval',
    input: {
      state: {
        ease_factor: 2.5,
        interval_days: 10,
        repetitions: 5,
        status: 'review',
        next_review_at: '2026-01-01T00:00:00.000Z',
      },
      quality: 1,
      reviewed_at: '2026-07-15T14:30:00.000Z',
    },
    expected: {
      ease_factor: 1.96,
      interval_days: 1,
      repetitions: 0,
      status: 'learning',
      next_review_at: '2026-07-16T00:00:00.000Z',
      last_reviewed_at: '2026-07-15T14:30:00.000Z',
    },
  },
  {
    name: 'first success moves card to learning',
    input: {
      state: {
        ease_factor: 2.5,
        interval_days: 0,
        repetitions: 0,
        status: 'new',
        next_review_at: '2026-07-15T00:00:00.000Z',
      },
      quality: 4,
      reviewed_at: '2026-07-15T10:00:00.000Z',
    },
    expected: {
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 1,
      status: 'learning',
      next_review_at: '2026-07-16T00:00:00.000Z',
      last_reviewed_at: '2026-07-15T10:00:00.000Z',
    },
  },
  {
    name: 'second success sets six-day interval',
    input: {
      state: {
        ease_factor: 2.5,
        interval_days: 1,
        repetitions: 1,
        status: 'learning',
        next_review_at: '2026-07-16T00:00:00.000Z',
      },
      quality: 4,
      reviewed_at: '2026-07-16T10:00:00.000Z',
    },
    expected: {
      ease_factor: 2.5,
      interval_days: 6,
      repetitions: 2,
      status: 'review',
      next_review_at: '2026-07-22T00:00:00.000Z',
      last_reviewed_at: '2026-07-16T10:00:00.000Z',
    },
  },
  {
    name: 'later success multiplies interval by ease factor',
    input: {
      state: {
        ease_factor: 2.5,
        interval_days: 6,
        repetitions: 2,
        status: 'review',
        next_review_at: '2026-07-22T00:00:00.000Z',
      },
      quality: 4,
      reviewed_at: '2026-07-22T10:00:00.000Z',
    },
    expected: {
      ease_factor: 2.5,
      interval_days: 15,
      repetitions: 3,
      status: 'review',
      next_review_at: '2026-08-06T00:00:00.000Z',
      last_reviewed_at: '2026-07-22T10:00:00.000Z',
    },
  },
  {
    name: 'ease factor floors at 1.3',
    input: {
      state: {
        ease_factor: 1.32,
        interval_days: 5,
        repetitions: 3,
        status: 'review',
        next_review_at: '2026-06-01T00:00:00.000Z',
      },
      quality: 3,
      reviewed_at: '2026-06-01T12:00:00.000Z',
    },
    expected: {
      ease_factor: 1.3,
      interval_days: 7,
      repetitions: 4,
      status: 'review',
      next_review_at: '2026-06-08T00:00:00.000Z',
      last_reviewed_at: '2026-06-01T12:00:00.000Z',
    },
  },
  {
    name: 'mastered when interval and repetitions thresholds met',
    input: {
      state: {
        ease_factor: 2.5,
        interval_days: 15,
        repetitions: 4,
        status: 'review',
        next_review_at: '2026-08-01T00:00:00.000Z',
      },
      quality: 5,
      reviewed_at: '2026-08-01T09:00:00.000Z',
    },
    expected: {
      ease_factor: 2.6,
      interval_days: 38,
      repetitions: 5,
      status: 'mastered',
      next_review_at: '2026-09-08T00:00:00.000Z',
      last_reviewed_at: '2026-08-01T09:00:00.000Z',
    },
  },
  {
    name: 'UTC year boundary when adding interval days',
    input: {
      state: {
        ease_factor: 2.5,
        interval_days: 10,
        repetitions: 3,
        status: 'review',
        next_review_at: '2026-12-20T00:00:00.000Z',
      },
      quality: 2,
      reviewed_at: '2026-12-31T23:59:59.000Z',
    },
    expected: {
      ease_factor: 2.18,
      interval_days: 1,
      repetitions: 0,
      status: 'learning',
      next_review_at: '2027-01-01T00:00:00.000Z',
      last_reviewed_at: '2026-12-31T23:59:59.000Z',
    },
  },
];
