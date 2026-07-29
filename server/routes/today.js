import { Router } from 'express';

export function createTodayRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const settings = JSON.parse(db.prepare('SELECT settings FROM users WHERE id = 1').get()?.settings || '{}');
    const currentLevel = Number(settings.current_level || 2);
    const deckSize = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1').get().c;
    const due = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1 AND next_review <= ?').get(today).c;
    const todayStats = db.prepare('SELECT * FROM user_stats WHERE user_id = 1 AND date = ?').get(today) || {};
    const reading = db.prepare(`
      SELECT id, title, hsk_level, format
      FROM readings
      WHERE hsk_level = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `).get(Math.min(2, currentLevel)) || null;

    const blocks = [
      Number(todayStats.cards_reviewed || 0) > 0,
      Number(todayStats.exercises_done || 0) >= 5,
      Number(todayStats.readings_done || 0) >= 1,
    ];

    res.json({
      profile: { current_level: Math.max(2, currentLevel), mode: 'hsk2_consolidation' },
      flashcards: {
        deck_size: deckSize,
        due,
        target: Number(settings.cards_per_day || 20),
        completed: Number(todayStats.cards_reviewed || 0),
      },
      exercises: {
        target: 5,
        completed: Number(todayStats.exercises_done || 0),
      },
      reading: {
        target: 1,
        completed: Number(todayStats.readings_done || 0),
        level: 2,
        next: reading,
      },
      progress: {
        completed_blocks: blocks.filter(Boolean).length,
        total_blocks: 3,
      },
    });
  });

  return router;
}
