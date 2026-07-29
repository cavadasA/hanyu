const STAT_FIELDS = ['cards_reviewed', 'cards_new', 'exercises_done', 'readings_done', 'time_spent_ms'];

function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

export function recordDailyStats(db, updates, date = todayIsoDate()) {
  const existing = db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(date);
  const cleanUpdates = Object.fromEntries(
    STAT_FIELDS.map((field) => [field, Math.max(0, Number(updates[field] || 0))])
  );

  if (!existing) {
    db.prepare(`
      INSERT INTO user_stats (user_id, date, cards_reviewed, cards_new, exercises_done, readings_done, time_spent_ms)
      VALUES (1, @date, @cards_reviewed, @cards_new, @exercises_done, @readings_done, @time_spent_ms)
    `).run({ date, ...cleanUpdates });

    return db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(date);
  }

  db.prepare(`
    UPDATE user_stats
    SET cards_reviewed = cards_reviewed + @cards_reviewed,
        cards_new = cards_new + @cards_new,
        exercises_done = exercises_done + @exercises_done,
        readings_done = readings_done + @readings_done,
        time_spent_ms = time_spent_ms + @time_spent_ms
    WHERE id = @id
  `).run({ id: existing.id, ...cleanUpdates });

  return db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(date);
}
