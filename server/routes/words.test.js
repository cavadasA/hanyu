import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createWordsRouter } from './words.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/words', createWordsRouter(db));
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

describe('Words API', () => {
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

  it('GET /api/words returns paginated words', async () => {
    const response = await request(app, '/api/words');

    expect(response.status).toBe(200);
    expect(response.body.words).toBeInstanceOf(Array);
    expect(response.body.words.length).toBeGreaterThan(0);
    expect(response.body.total).toBeGreaterThan(0);
  });

  it('GET /api/words?level=1 filters by HSK level', async () => {
    const response = await request(app, '/api/words?level=1');

    expect(response.status).toBe(200);
    expect(response.body.words.every((word) => word.hsk_level === 1)).toBe(true);
  });

  it('GET /api/words?search=好 searches by hanzi', async () => {
    const response = await request(app, '/api/words?search=好');

    expect(response.status).toBe(200);
    expect(response.body.words.some((word) => word.hanzi.includes('好'))).toBe(true);
  });

  it('GET /api/words/:id returns a single word', async () => {
    const response = await request(app, '/api/words/1');

    expect(response.status).toBe(200);
    expect(response.body.hanzi).toBeTruthy();
    expect(response.body.pinyin).toBeTruthy();
  });

  it('GET /api/words/99999 returns 404', async () => {
    const response = await request(app, '/api/words/99999');

    expect(response.status).toBe(404);
  });
});