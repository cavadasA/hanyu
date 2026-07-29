import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { tokenizeReadingContent } from './reading-tokenizer.js';

describe('tokenizeReadingContent', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
  });

  it('prefers longest dictionary matches', () => {
    const tokens = tokenizeReadingContent(db, '你好，朋友。');

    expect(tokens.map((token) => token.text)).toEqual(['你好', '，', '朋友', '。']);
    expect(tokens[0].word.hanzi).toBe('你好');
    expect(tokens[2].word.hanzi).toBe('朋友');
  });

  it('falls back to unknown Chinese characters', () => {
    const tokens = tokenizeReadingContent(db, '龘。');

    expect(tokens).toEqual([
      { id: 't0', text: '龘', type: 'unknown' },
      { id: 't1', text: '。', type: 'punctuation' },
    ]);
  });

  it('marks words already in SRS', () => {
    const word = db.prepare("SELECT id FROM words WHERE hanzi = '你好' LIMIT 1").get();
    db.prepare("INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, ?, '2026-07-28', 'new')").run(word.id);

    const [token] = tokenizeReadingContent(db, '你好');

    expect(token.word.in_srs).toBe(true);
  });
});
