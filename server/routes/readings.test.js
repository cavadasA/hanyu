import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createReadingsRouter } from './readings.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/readings', createReadingsRouter(db));
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

describe('Readings API', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db);
    app = createApp(db);

    db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'dialogue', '你好', '你好，我叫小明。', 'Nǐ hǎo, wǒ jiào Xiǎo Míng.', ?, 'seed')
    `).run(
      JSON.stringify([
        {
          question: '小明说了什么？',
          options: ['你好', '再见', '谢谢', '对不起'],
          correct: '你好',
        },
      ])
    );
  });

  afterEach(() => {
    db.close();
  });

  it('GET /api/readings returns cached readings', async () => {
    const response = await request(app, 'GET', '/api/readings');

    expect(response.status).toBe(200);
    expect(response.body.readings).toBeInstanceOf(Array);
    expect(response.body.readings.length).toBe(1);
  });

  it('GET /api/readings/:id returns a specific reading', async () => {
    const response = await request(app, 'GET', '/api/readings/1');

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('你好');
    expect(response.body.content).toBeTruthy();
    expect(response.body.questions).toBeInstanceOf(Array);
  });

  it('GET /api/readings/99999 returns 404', async () => {
    const response = await request(app, 'GET', '/api/readings/99999');

    expect(response.status).toBe(404);
  });

  it('GET /api/readings?level=1 filters by level', async () => {
    const response = await request(app, 'GET', '/api/readings?level=1');

    expect(response.body.readings.every((reading) => reading.hsk_level === 1)).toBe(true);
  });
});