import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createExercisesRouter } from './exercises.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/exercises', createExercisesRouter(db));
  return app;
}

async function request(app, method, path, body) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const options = { method, headers: { 'Content-Type': 'application/json' } };

      if (body) {
        options.body = JSON.stringify(body);
      }

      fetch(`http://localhost:${port}${path}`, options)
        .then(async (response) => ({
          status: response.status,
          body: await response.json(),
        }))
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

describe('Exercises API', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  it('POST /api/exercises/generate returns cached exercise when no AI', async () => {
    db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at, source_model)
      VALUES ('fill_blank', 1, ?, '每天', datetime('now'), 'seed')
    `).run(
      JSON.stringify({
        type: 'fill_blank',
        sentence: '我___去学校。',
        options: ['每天', '昨天', '已经', '可能'],
        correct: '每天',
        explanation: '每天 means every day.',
      })
    );

    const response = await request(app, 'POST', '/api/exercises/generate', { type: 'fill_blank', level: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('type', 'fill_blank');
    expect(response.body).toHaveProperty('sentence');
  });

  it('POST /api/exercises/:id/check validates correct answer', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at)
      VALUES ('fill_blank', 1, '{}', '每天', datetime('now'))
    `).run();

    const response = await request(app, 'POST', `/api/exercises/${lastInsertRowid}/check`, { answer: '每天' });

    expect(response.status).toBe(200);
    expect(response.body.correct).toBe(true);
  });

  it('POST /api/exercises/:id/check detects wrong answer', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at)
      VALUES ('fill_blank', 1, '{}', '每天', datetime('now'))
    `).run();

    const response = await request(app, 'POST', `/api/exercises/${lastInsertRowid}/check`, { answer: '昨天' });

    expect(response.status).toBe(200);
    expect(response.body.correct).toBe(false);
    expect(response.body.correct_answer).toBe('每天');
  });

  it('GET /api/exercises/history returns past exercises', async () => {
    db.prepare(`
      INSERT INTO exercises (type, hsk_level, prompt, answer, generated_at)
      VALUES ('fill_blank', 1, '{}', '每天', datetime('now'))
    `).run();

    const response = await request(app, 'GET', '/api/exercises/history');

    expect(response.status).toBe(200);
    expect(response.body.exercises).toBeInstanceOf(Array);
    expect(response.body.exercises.length).toBe(1);
  });
});