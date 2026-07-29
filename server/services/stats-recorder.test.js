import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../db/index.js';
import { recordDailyStats } from './stats-recorder.js';

describe('recordDailyStats', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates a daily stats row when none exists', () => {
    const stats = recordDailyStats(db, { cards_reviewed: 1, cards_new: 1 }, '2026-07-28');

    expect(stats.cards_reviewed).toBe(1);
    expect(stats.cards_new).toBe(1);
  });

  it('increments an existing daily stats row', () => {
    recordDailyStats(db, { cards_reviewed: 1 }, '2026-07-28');
    const stats = recordDailyStats(db, { cards_reviewed: 2, readings_done: 1 }, '2026-07-28');

    expect(stats.cards_reviewed).toBe(3);
    expect(stats.readings_done).toBe(1);
  });
});
