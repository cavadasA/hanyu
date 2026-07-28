import { Router } from 'express';

export function createGrammarRouter(db) {
  const router = Router();

  router.get('/:level', (req, res) => {
    const level = parseInt(req.params.level, 10);
    if (Number.isNaN(level)) {
      res.status(400).json({ error: 'Invalid level' });
      return;
    }

    const points = db
      .prepare('SELECT * FROM grammar_points WHERE hsk_level = ? ORDER BY order_idx')
      .all(level)
      .map((point) => ({
        ...point,
        examples: JSON.parse(point.examples),
      }));

    res.json(points);
  });

  router.get('/:level/:id', (req, res) => {
    const level = parseInt(req.params.level, 10);
    const id = parseInt(req.params.id, 10);

    if (Number.isNaN(level) || Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid parameters' });
      return;
    }

    const point = db
      .prepare('SELECT * FROM grammar_points WHERE id = ? AND hsk_level = ?')
      .get(id, level);

    if (!point) {
      res.status(404).json({ error: 'Grammar point not found' });
      return;
    }

    res.json({
      ...point,
      examples: JSON.parse(point.examples),
    });
  });

  return router;
}