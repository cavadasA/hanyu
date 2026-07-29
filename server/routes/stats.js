import { Router } from 'express';

export function createStatsRouter(db) {
  const router = Router();

  router.get('/dashboard', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const totalCards = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1').get().c;
    const dueCards = db
      .prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1 AND next_review <= ?')
      .get(today).c;
    const byStatus = db
      .prepare('SELECT status, COUNT(*) as count FROM srs_cards WHERE user_id = 1 GROUP BY status')
      .all();
    const todayStats =
      db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(today) ||
      {
        cards_reviewed: 0,
        cards_new: 0,
        exercises_done: 0,
        readings_done: 0,
        time_spent_ms: 0,
        streak_days: 0,
      };

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 90);
    const heatmap = db
      .prepare(`
        SELECT date, cards_reviewed + exercises_done + readings_done as activity
        FROM user_stats
        WHERE user_id = 1 AND date >= ?
        ORDER BY date
      `)
      .all(since.toISOString().split('T')[0]);

    const learningCurve = db
      .prepare(`
        SELECT substr(rl.reviewed_at, 1, 10) as date,
          (
            SELECT COUNT(*)
            FROM srs_cards
            WHERE user_id = 1
              AND status = 'mastered'
              AND last_review <= substr(rl.reviewed_at, 1, 10)
          ) as mastered
        FROM review_log rl
        JOIN srs_cards sc ON rl.card_id = sc.id
        WHERE sc.user_id = 1
        GROUP BY substr(rl.reviewed_at, 1, 10)
        ORDER BY date
      `)
      .all();

    const exerciseByType = db.prepare('SELECT type, COUNT(*) as count FROM exercises GROUP BY type').all();

    const weekAgo = new Date();
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const weekMs = db
      .prepare('SELECT COALESCE(SUM(time_spent_ms), 0) as total FROM user_stats WHERE user_id = 1 AND date >= ?')
      .get(weekAgo.toISOString().split('T')[0]).total;
    const allTimeMs = db
      .prepare('SELECT COALESCE(SUM(time_spent_ms), 0) as total FROM user_stats WHERE user_id = 1')
      .get().total;

    const readingTotal = db.prepare('SELECT COUNT(*) as c FROM readings').get().c;

    res.json({
      cards: {
        total: totalCards,
        due: dueCards,
        by_status: Object.fromEntries(byStatus.map((row) => [row.status, row.count])),
      },
      today: todayStats,
      heatmap,
      streak: calculateStreak(db),
      learning_curve: learningCurve,
      exercise_stats: {
        by_type: Object.fromEntries(exerciseByType.map((row) => [row.type, row.count])),
        accuracy: null,
      },
      reading_stats: {
        total: readingTotal,
        avg_score: null,
      },
      time: {
        today_ms: todayStats.time_spent_ms || 0,
        week_ms: weekMs,
        all_time_ms: allTimeMs,
      },
    });
  });

  router.get('/streak', (req, res) => {
    res.json(calculateStreak(db));
  });

  router.post('/log-time', (req, res) => {
    const { ms } = req.body;
    if (!ms || ms < 0) {
      res.status(400).json({ error: 'ms is required and must be positive' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const existing = db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(today);

    if (existing) {
      db.prepare('UPDATE user_stats SET time_spent_ms = time_spent_ms + ? WHERE id = ?').run(ms, existing.id);
      res.json({ time_spent_ms: existing.time_spent_ms + ms });
      return;
    }

    db.prepare('INSERT INTO user_stats (user_id, date, time_spent_ms) VALUES (1, ?, ?)').run(today, ms);
    res.json({ time_spent_ms: ms });
  });

  return router;
}

function calculateStreak(db) {
  const days = db
    .prepare(`
      SELECT date FROM user_stats
      WHERE user_id = 1 AND (cards_reviewed > 0 OR exercises_done > 0 OR readings_done > 0)
      ORDER BY date DESC
      LIMIT 365
    `)
    .all()
    .map((row) => row.date);

  if (days.length === 0) {
    return { current: 0, longest: 0 };
  }

  let current = 0;
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (days[0] === today || days[0] === yesterdayStr) {
    current = 1;
    for (let index = 1; index < days.length; index += 1) {
      const previous = new Date(`${days[index - 1]}T00:00:00Z`);
      const currentDay = new Date(`${days[index]}T00:00:00Z`);
      const diffDays = (previous - currentDay) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        current += 1;
      } else {
        break;
      }
    }
  }

  let longest = days.length > 0 ? 1 : 0;
  let streak = 1;
  for (let index = 1; index < days.length; index += 1) {
    const previous = new Date(`${days[index - 1]}T00:00:00Z`);
    const currentDay = new Date(`${days[index]}T00:00:00Z`);
    const diffDays = (previous - currentDay) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      streak += 1;
      longest = Math.max(longest, streak);
    } else {
      streak = 1;
    }
  }

  return { current, longest };
}