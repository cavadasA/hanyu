import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createFlashcardsRouter } from './flashcards.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/flashcards', createFlashcardsRouter(db));
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

describe('Flashcards API', () => {
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

  it('POST /api/flashcards/add creates a new SRS card', async () => {
    const word = db.prepare('SELECT id FROM words LIMIT 1').get();
    const response = await request(app, 'POST', '/api/flashcards/add', { word_id: word.id });

    expect(response.status).toBe(201);
    expect(response.body.card_id).toBeDefined();
  });

  it('POST /api/flashcards/add rejects duplicate word', async () => {
    const word = db.prepare('SELECT id FROM words LIMIT 1').get();

    await request(app, 'POST', '/api/flashcards/add', { word_id: word.id });
    const response = await request(app, 'POST', '/api/flashcards/add', { word_id: word.id });

    expect(response.status).toBe(409);
  });

  it('GET /api/flashcards/due returns due cards', async () => {
    const word = db.prepare('SELECT id FROM words LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];

    db.prepare(
      "INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, ?, ?, 'new')"
    ).run(word.id, today);

    const response = await request(app, 'GET', '/api/flashcards/due');

    expect(response.status).toBe(200);
    expect(response.body.cards).toBeInstanceOf(Array);
    expect(response.body.cards.length).toBeGreaterThan(0);
    expect(response.body.cards[0].hanzi).toBeTruthy();
  });

  it('POST /api/flashcards/:id/review updates SRS data', async () => {
    const word = db.prepare('SELECT id FROM words LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO srs_cards (user_id, word_id, next_review, status) VALUES (1, ?, ?, 'new')"
    ).run(word.id, today);

    const response = await request(app, 'POST', `/api/flashcards/${lastInsertRowid}/review`, { quality: 4 });

    expect(response.status).toBe(200);
    expect(response.body.interval).toBeGreaterThan(0);
    expect(response.body.next_review).toBeTruthy();
  });

  it('GET /api/flashcards/stats returns statistics', async () => {
    const response = await request(app, 'GET', '/api/flashcards/stats');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('total');
    expect(response.body).toHaveProperty('due');
    expect(response.body).toHaveProperty('by_status');
  });
});