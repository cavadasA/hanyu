import { Router } from 'express';

export function createWordsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { level, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;
    const where = [];
    const params = {};

    if (level) {
      where.push('hsk_level = @level');
      params.level = parseInt(level, 10);
    }

    if (search) {
      where.push('(hanzi LIKE @search OR pinyin LIKE @search OR meaning_en LIKE @search)');
      params.search = `%${search}%`;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) as c FROM words ${whereClause}`).get(params).c;
    const words = db.prepare(
      `SELECT * FROM words ${whereClause} ORDER BY hsk_level, frequency LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit: limitNum, offset });

    res.json({ words, total, page: pageNum, limit: limitNum });
  });

  router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const word = db.prepare('SELECT * FROM words WHERE id = ?').get(id);
    if (!word) {
      res.status(404).json({ error: 'Word not found' });
      return;
    }

    res.json(word);
  });

  return router;
}