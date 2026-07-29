import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createStarterDeck } from './starter-deck.js';

describe('createStarterDeck', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
  });

  it('creates a 150-card HSK2 consolidation starter deck by default', () => {
    const result = createStarterDeck(db, {});

    expect(result.strategy).toBe('hsk2_consolidation');
    expect(result.inserted).toBe(150);
    expect(result.total_deck_size).toBe(150);
  });

  it('does not duplicate cards when run twice', () => {
    createStarterDeck(db, { limit: 20 });
    const result = createStarterDeck(db, { limit: 20 });

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(20);
    expect(result.total_deck_size).toBe(20);
  });

  it('supports HSK1 review strategy', () => {
    createStarterDeck(db, { strategy: 'hsk1_review', limit: 30 });
    const levels = db.prepare(`
      SELECT DISTINCT w.hsk_level
      FROM srs_cards sc
      JOIN words w ON w.id = sc.word_id
      ORDER BY w.hsk_level
    `).all().map((row) => row.hsk_level);

    expect(levels).toEqual([1]);
  });
});
