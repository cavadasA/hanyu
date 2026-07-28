import { Router } from 'express';
import { calculateSrs } from '../services/srs-engine.js';

export function createFlashcardsRouter(db) {
  const router = Router();

  router.get('/due', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);

    const cards = db
      .prepare(`
        SELECT sc.*, w.hanzi, w.pinyin, w.meaning_en, w.meaning_es, w.hsk_level, w.pos
        FROM srs_cards sc
        JOIN words w ON sc.word_id = w.id
        WHERE sc.user_id = 1 AND sc.next_review <= ?
        ORDER BY sc.next_review ASC, sc.status = 'new' DESC
        LIMIT ?
      `)
      .all(today, limit);

    res.json({ cards, total: cards.length });
  });

  router.post('/:id/review', (req, res) => {
    const cardId = parseInt(req.params.id, 10);
    const { quality, time_ms } = req.body;

    if (Number.isNaN(cardId)) {
      res.status(400).json({ error: 'Invalid card ID' });
      return;
    }

    if (quality === undefined || quality < 0 || quality > 5) {
      res.status(400).json({ error: 'Quality must be 0-5' });
      return;
    }

    const card = db.prepare('SELECT * FROM srs_cards WHERE id = ?').get(cardId);
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const result = calculateSrs({
      quality,
      repetitions: card.repetitions,
      easeFactor: card.ease_factor,
      interval: card.interval,
      today,
    });

    db.prepare(`
      UPDATE srs_cards
      SET ease_factor = ?, interval = ?, repetitions = ?,
          next_review = ?, last_review = ?, status = ?
      WHERE id = ?
    `).run(
      result.easeFactor,
      result.interval,
      result.repetitions,
      result.nextReview,
      today,
      result.status,
      cardId
    );

    db.prepare(`
      INSERT INTO review_log (card_id, reviewed_at, quality, time_ms)
      VALUES (?, ?, ?, ?)
    `).run(cardId, new Date().toISOString(), quality, time_ms || null);

    res.json({
      card_id: cardId,
      interval: result.interval,
      next_review: result.nextReview,
      ease_factor: result.easeFactor,
      status: result.status,
    });
  });

  router.get('/stats', (req, res) => {
    const total = db.prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1').get().c;
    const today = new Date().toISOString().split('T')[0];
    const due = db
      .prepare('SELECT COUNT(*) as c FROM srs_cards WHERE user_id = 1 AND next_review <= ?')
      .get(today).c;
    const byStatus = db
      .prepare('SELECT status, COUNT(*) as count FROM srs_cards WHERE user_id = 1 GROUP BY status')
      .all();
    const byLevel = db
      .prepare(`
        SELECT w.hsk_level, COUNT(*) as count
        FROM srs_cards sc
        JOIN words w ON sc.word_id = w.id
        WHERE sc.user_id = 1
        GROUP BY w.hsk_level
      `)
      .all();

    res.json({
      total,
      due,
      by_status: Object.fromEntries(byStatus.map((row) => [row.status, row.count])),
      by_level: Object.fromEntries(byLevel.map((row) => [row.hsk_level, row.count])),
    });
  });

  router.post('/add', (req, res) => {
    const { word_id } = req.body;
    if (!word_id) {
      res.status(400).json({ error: 'word_id is required' });
      return;
    }

    const word = db.prepare('SELECT id FROM words WHERE id = ?').get(word_id);
    if (!word) {
      res.status(404).json({ error: 'Word not found' });
      return;
    }

    const existing = db.prepare('SELECT id FROM srs_cards WHERE user_id = 1 AND word_id = ?').get(word_id);
    if (existing) {
      res.status(409).json({ error: 'Word already in deck' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, ?, ?, 'new')"
    ).run(word_id, today);

    res.status(201).json({ card_id: Number(lastInsertRowid) });
  });

  return router;
}