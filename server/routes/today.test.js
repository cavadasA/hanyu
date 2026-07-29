import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createTodayRouter } from './today.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/today', createTodayRouter(db));
  return app;
}

async function request(app, path) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      fetch(`http://127.0.0.1:${port}${path}`)
        .then(async (response) => ({ status: response.status, body: await response.json() }))
        .then((result) => {
          server.close();
          resolve(result);
        })
        .catch((error) => {
          server.close();
          resolve({ status: 500, body: { error: error.message } });
        });
    });
  });
}

describe('Today API', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  it('returns daily HSK2 learning summary', async () => {
    const response = await request(app, '/api/today');

    expect(response.status).toBe(200);
    expect(response.body.profile).toEqual({ current_level: 2, mode: 'hsk2_consolidation' });
    expect(response.body.flashcards).toHaveProperty('due');
    expect(response.body.exercises.target).toBe(5);
    expect(response.body.reading.level).toBe(2);
    expect(response.body.progress).toHaveProperty('completed_blocks');
  });

  it('does not count pending cards as a completed block', async () => {
    const today = new Date().toISOString().split('T')[0];
    db.prepare("INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, 1, ?, 'new')").run(today);

    const response = await request(app, '/api/today');

    expect(response.body.flashcards.due).toBeGreaterThan(0);
    expect(response.body.progress.completed_blocks).toBe(0);
  });
});
