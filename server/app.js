import cors from 'cors';
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db/index.js';
import { createExercisesRouter } from './routes/exercises.js';
import { createFlashcardsRouter } from './routes/flashcards.js';
import { createGrammarRouter } from './routes/grammar.js';
import { createReadingsRouter } from './routes/readings.js';
import { createSettingsRouter } from './routes/settings.js';
import { createStatsRouter } from './routes/stats.js';
import { createWordsRouter } from './routes/words.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const db = getDb();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/words', createWordsRouter(db));
app.use('/api/grammar', createGrammarRouter(db));
app.use('/api/flashcards', createFlashcardsRouter(db));
app.use('/api/exercises', createExercisesRouter(db));
app.use('/api/readings', createReadingsRouter(db));
app.use('/api/settings', createSettingsRouter(db));
app.use('/api/stats', createStatsRouter(db));

const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }

  res.sendFile(join(clientDist, 'index.html'));
});

export default app;

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Hanyu server running on http://localhost:${PORT}`);
  });
}