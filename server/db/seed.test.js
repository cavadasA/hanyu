import { describe, it, expect, afterEach } from 'vitest';
import { createTestDb } from './index.js';
import { seedDatabase } from './seed.js';

describe('Database seeding', () => {
  let db;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  it('seeds HSK 1 words', () => {
    db = createTestDb();
    seedDatabase(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM words WHERE hsk_level = 1').get();

    expect(count.c).toBeGreaterThan(0);
  });

  it('seeds HSK 2 words', () => {
    db = createTestDb();
    seedDatabase(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM words WHERE hsk_level = 2').get();

    expect(count.c).toBeGreaterThan(0);
  });

  it('seeds HSK 3 words', () => {
    db = createTestDb();
    seedDatabase(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM words WHERE hsk_level = 3').get();

    expect(count.c).toBeGreaterThan(0);
  });

  it('seeds grammar points', () => {
    db = createTestDb();
    seedDatabase(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM grammar_points').get();

    expect(count.c).toBeGreaterThan(0);
  });

  it('words have required fields', () => {
    db = createTestDb();
    seedDatabase(db);
    const word = db.prepare('SELECT * FROM words LIMIT 1').get();

    expect(word.hanzi).toBeTruthy();
    expect(word.pinyin).toBeTruthy();
    expect(word.meaning_en).toBeTruthy();
    expect(word.hsk_level).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent (running twice does not duplicate)', () => {
    db = createTestDb();
    seedDatabase(db);
    const count1 = db.prepare('SELECT COUNT(*) as c FROM words').get().c;

    seedDatabase(db);
    const count2 = db.prepare('SELECT COUNT(*) as c FROM words').get().c;

    expect(count2).toBe(count1);
  });
});