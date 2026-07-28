import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createGrammarRouter } from './grammar.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/grammar', createGrammarRouter(db));
  return app;
}

async function request(app, path) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;

      fetch(`http://localhost:${port}${path}`)
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

describe('Grammar API', () => {
  let db;
  let app;

  beforeAll(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);
  });

  afterAll(() => {
    db.close();
  });

  it('GET /api/grammar/1 returns level 1 grammar points', async () => {
    const response = await request(app, '/api/grammar/1');

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body.every((point) => point.hsk_level === 1)).toBe(true);
  });

  it('grammar points have parsed examples', async () => {
    const response = await request(app, '/api/grammar/1');
    const point = response.body[0];

    expect(point.title).toBeTruthy();
    expect(point.explanation).toBeTruthy();
    expect(point.examples).toBeInstanceOf(Array);
    expect(point.examples[0]).toHaveProperty('zh');
    expect(point.examples[0]).toHaveProperty('en');
  });

  it('GET /api/grammar/1/:id returns a specific grammar point', async () => {
    const list = await request(app, '/api/grammar/1');
    const id = list.body[0].id;
    const response = await request(app, `/api/grammar/1/${id}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
  });

  it('GET /api/grammar/9 returns empty array for non-existent level', async () => {
    const response = await request(app, '/api/grammar/9');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});