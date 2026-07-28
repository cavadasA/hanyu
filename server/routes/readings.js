import { Router } from 'express';
import { getAiProvider } from '../services/ai-connector.js';

const VALID_FORMATS = ['short_text', 'story', 'dialogue'];

export function createReadingsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { level, format, limit = 20 } = req.query;
    const limitNum = Math.min(50, parseInt(limit, 10) || 20);
    const where = [];
    const params = {};

    if (level) {
      where.push('hsk_level = @level');
      params.level = parseInt(level, 10);
    }

    if (format && VALID_FORMATS.includes(format)) {
      where.push('format = @format');
      params.format = format;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const readings = db
      .prepare(
        `SELECT id, hsk_level, format, title, generated_at, source_model FROM readings ${whereClause} ORDER BY generated_at DESC LIMIT @limit`
      )
      .all({ ...params, limit: limitNum });

    res.json({ readings });
  });

  router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const reading = db.prepare('SELECT * FROM readings WHERE id = ?').get(id);
    if (!reading) {
      res.status(404).json({ error: 'Reading not found' });
      return;
    }

    res.json({
      ...reading,
      questions: JSON.parse(reading.questions),
    });
  });

  router.post('/generate', async (req, res) => {
    const { level, format } = req.body;

    if (!format || !VALID_FORMATS.includes(format)) {
      res.status(400).json({ error: `format must be one of: ${VALID_FORMATS.join(', ')}` });
      return;
    }

    const hskLevel = parseInt(level, 10) || 1;
    const settings = JSON.parse(db.prepare('SELECT settings FROM users WHERE id = 1').get()?.settings || '{}');
    const provider = getAiProvider(settings);

    if (!provider) {
      const cached = db
        .prepare('SELECT * FROM readings WHERE hsk_level = ? AND format = ? ORDER BY RANDOM() LIMIT 1')
        .get(hskLevel, format);

      if (cached) {
        res.json({ ...cached, questions: JSON.parse(cached.questions) });
        return;
      }

      res.status(503).json({ error: 'No AI provider configured and no cached readings available.' });
      return;
    }

    try {
      const reading = await provider.generateReading(hskLevel, format);
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        hskLevel,
        format,
        reading.title,
        reading.content,
        reading.pinyin_text || '',
        JSON.stringify(reading.questions),
        settings.ai_provider
      );

      const today = new Date().toISOString().split('T')[0];
      const existing = db.prepare('SELECT id FROM user_stats WHERE user_id = 1 AND date = ?').get(today);
      if (existing) {
        db.prepare('UPDATE user_stats SET readings_done = readings_done + 1 WHERE id = ?').run(existing.id);
      } else {
        db.prepare('INSERT INTO user_stats (user_id, date, readings_done) VALUES (1, ?, 1)').run(today);
      }

      res.json({ id: Number(lastInsertRowid), ...reading });
    } catch (error) {
      console.error('Reading generation failed:', error.message);
      res.status(500).json({ error: 'Failed to generate reading. Try again.' });
    }
  });

  return router;
}