import { Router } from 'express';
import { getAiProvider } from '../services/ai-connector.js';

const VALID_TYPES = ['fill_blank', 'multiple_choice', 'reorder', 'dictation', 'matching'];

export function createExercisesRouter(db) {
  const router = Router();

  router.post('/generate', async (req, res) => {
    const { type, level } = req.body;

    if (!type || !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }

    const hskLevel = parseInt(level, 10) || 1;
    const cached = db
      .prepare('SELECT * FROM exercises WHERE type = ? AND hsk_level = ? ORDER BY RANDOM() LIMIT 1')
      .get(type, hskLevel);
    const settings = JSON.parse(db.prepare('SELECT settings FROM users WHERE id = 1').get()?.settings || '{}');
    const provider = getAiProvider(settings);

    if (provider) {
      try {
        const words = db
          .prepare('SELECT hanzi FROM words WHERE hsk_level <= ? ORDER BY RANDOM() LIMIT 10')
          .all(hskLevel)
          .map((row) => row.hanzi);
        const exercise = await provider.generateExercise(type, hskLevel, { words });
        const { lastInsertRowid } = db.prepare(
          'INSERT INTO exercises (type, hsk_level, prompt, answer, source_model) VALUES (?, ?, ?, ?, ?)'
        ).run(type, hskLevel, JSON.stringify(exercise), exercise.correct || '', settings.ai_provider);

        res.json({ id: Number(lastInsertRowid), ...exercise });
        return;
      } catch (error) {
        console.error('AI generation failed:', error.message);
      }
    }

    if (cached) {
      res.json({ id: cached.id, ...JSON.parse(cached.prompt) });
      return;
    }

    res.status(503).json({
      error: 'No AI provider configured and no cached exercises available. Add an API key in Settings.',
    });
  });

  router.post('/:id/check', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { answer } = req.body;

    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid exercise ID' });
      return;
    }

    if (answer === undefined) {
      res.status(400).json({ error: 'answer is required' });
      return;
    }

    const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id);
    if (!exercise) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }

    const prompt = JSON.parse(exercise.prompt);
    let isCorrect = false;

    switch (exercise.type) {
      case 'reorder': {
        const expected = (prompt.correct_order || []).join('');
        isCorrect = answer === expected;
        break;
      }
      case 'matching':
        isCorrect = answer === 'matched';
        break;
      case 'dictation': {
        const normalized = String(answer).trim().toLowerCase();
        const expected = String(prompt.audio_text || exercise.answer || '').trim().toLowerCase();
        const pinyin = String(prompt.pinyin || '').trim().toLowerCase();
        isCorrect = normalized === expected || (prompt.accept_pinyin && normalized === pinyin);
        break;
      }
      default:
        isCorrect = exercise.answer === answer;
        break;
    }

    const today = new Date().toISOString().split('T')[0];
    const existing = db.prepare('SELECT id FROM user_stats WHERE user_id = 1 AND date = ?').get(today);
    if (existing) {
      db.prepare('UPDATE user_stats SET exercises_done = exercises_done + 1 WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO user_stats (user_id, date, exercises_done) VALUES (1, ?, 1)').run(today);
    }

    const correctAnswer = exercise.type === 'reorder'
      ? (prompt.correct_order || []).join('')
      : prompt.audio_text || exercise.answer;

    res.json({
      correct: isCorrect,
      correct_answer: correctAnswer,
    });
  });

  router.get('/history', (req, res) => {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const exercises = db
      .prepare(
        'SELECT id, type, hsk_level, prompt, generated_at, source_model FROM exercises ORDER BY generated_at DESC LIMIT ?'
      )
      .all(limit)
      .map((exercise) => ({
        ...exercise,
        prompt: JSON.parse(exercise.prompt),
      }));

    res.json({ exercises });
  });

  return router;
}