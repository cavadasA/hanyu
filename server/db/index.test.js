import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'migrations', '001-initial-schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

describe('Database schema', () => {
  let db;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  it('creates all tables', () => {
    db = createTestDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => row.name);

    expect(tables).toContain('users');
    expect(tables).toContain('words');
    expect(tables).toContain('grammar_points');
    expect(tables).toContain('srs_cards');
    expect(tables).toContain('review_log');
    expect(tables).toContain('exercises');
    expect(tables).toContain('readings');
    expect(tables).toContain('user_stats');
  });

  it('enforces unique user_stats per user per date', () => {
    db = createTestDb();
    db.prepare("INSERT INTO users (username, created_at, settings) VALUES ('test', '2026-01-01', '{}')").run();
    db.prepare("INSERT INTO user_stats (user_id, date, cards_reviewed) VALUES (1, '2026-01-01', 5)").run();

    expect(() => {
      db.prepare("INSERT INTO user_stats (user_id, date, cards_reviewed) VALUES (1, '2026-01-01', 10)").run();
    }).toThrow();
  });

  it('enforces foreign key on srs_cards.word_id', () => {
    db = createTestDb();
    db.prepare("INSERT INTO users (username, created_at, settings) VALUES ('test', '2026-01-01', '{}')").run();

    expect(() => {
      db.prepare("INSERT INTO srs_cards (user_id, word_id, next_review) VALUES (1, 9999, '2026-01-01')").run();
    }).toThrow();
  });

  it('seeds default user on migration', () => {
    db = createTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = 1').get();

    expect(user).toBeDefined();
    expect(user.username).toBe('default');
  });
});