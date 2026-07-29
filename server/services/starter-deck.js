const STRATEGIES = {
  hsk2_consolidation: [1, 2],
  hsk1_review: [1],
};

export function createStarterDeck(db, options = {}) {
  const strategy = STRATEGIES[options.strategy] ? options.strategy : 'hsk2_consolidation';
  const limit = Math.max(1, Math.min(300, Number(options.limit || 150)));
  const levels = STRATEGIES[strategy];
  const today = new Date().toISOString().split('T')[0];

  const topWords = db.prepare(`
    SELECT id
    FROM words
    WHERE hsk_level IN (${levels.map(() => '?').join(',')})
    ORDER BY hsk_level DESC, COALESCE(frequency, 999999), id
    LIMIT ?
  `).all(...levels, limit);

  const existingWordIds = new Set(
    db.prepare('SELECT word_id FROM srs_cards WHERE user_id = 1').all().map((row) => row.word_id)
  );

  const insert = db.prepare(`
    INSERT INTO srs_cards (user_id, word_id, next_review, status)
    VALUES (1, ?, ?, 'new')
  `);

  let inserted = 0;
  let skipped = 0;

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      if (existingWordIds.has(item.id)) {
        skipped += 1;
      } else {
        insert.run(item.id, today);
        inserted += 1;
      }
    }
  });

  insertMany(topWords);

  const total = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1').get().c;

  return {
    strategy,
    inserted,
    skipped,
    total_deck_size: total,
  };
}
