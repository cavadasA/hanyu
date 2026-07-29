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
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const options = { method, headers: { 'Content-Type': 'application/json' } };

      if (body) {
        options.body = JSON.stringify(body);
      }

      fetch(`http://127.0.0.1:${port}${path}`, options)
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

  it('GET /api/readings/:id normalizes letter-only correct answers', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'short_text', '我的家', '我家有三口人。', 'Wǒ jiā yǒu sān kǒu rén.', ?, 'deepseek')
    `).run(JSON.stringify([
      {
        question: '小明家有几口人？',
        options: ['两口人', '三口人', '四口人', '五口人'],
        correct: 'B',
      },
    ]));

    const response = await request(app, 'GET', `/api/readings/${lastInsertRowid}`);

    expect(response.status).toBe(200);
    expect(response.body.questions[0].options[1]).toEqual({ id: 'B', text: '三口人' });
    expect(response.body.questions[0].correct_option_id).toBe('B');
  });

  it('POST /api/readings/:id/complete scores canonical option ids', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'short_text', '我的家', '我家有一只猫。', 'Wǒ jiā yǒu yī zhī māo.', ?, 'deepseek')
    `).run(JSON.stringify([
      {
        question: '小明的家有几只猫？',
        options: ['A. 一只', 'B. 两只', 'C. 三只', 'D. 没有猫'],
        correct: 'A',
      },
    ]));

    const response = await request(app, 'POST', `/api/readings/${lastInsertRowid}/complete`, {
      answers: { q0: 'A' },
    });

    expect(response.status).toBe(200);
    expect(response.body.score).toBe(1);
    expect(response.body.total).toBe(1);
  });

  it('POST /api/readings/:id/complete increments readings_done', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'short_text', '你好', '你好。', 'Nǐ hǎo.', ?, 'seed')
    `).run(JSON.stringify([{ question: '说了什么？', options: ['你好', '再见'], correct: '你好' }]));

    await request(app, 'POST', `/api/readings/${lastInsertRowid}/complete`, { answers: { q0: 'A' } });

    const today = new Date().toISOString().split('T')[0];
    const stats = db.prepare('SELECT readings_done FROM user_stats WHERE user_id = 1 AND date = ?').get(today);
    expect(stats.readings_done).toBe(1);
  });

  it('POST /api/readings/:id/complete is idempotent on the same date', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'short_text', '你好', '你好。', 'Nǐ hǎo.', ?, 'seed')
    `).run(JSON.stringify([{ question: '说了什么？', options: ['你好', '再见'], correct: '你好' }]));

    await request(app, 'POST', `/api/readings/${lastInsertRowid}/complete`, { answers: { q0: 'A' } });
    await request(app, 'POST', `/api/readings/${lastInsertRowid}/complete`, { answers: { q0: 'A' } });

    const today = new Date().toISOString().split('T')[0];
    const stats = db.prepare('SELECT readings_done FROM user_stats WHERE user_id = 1 AND date = ?').get(today);
    expect(stats.readings_done).toBe(1);
  });

  it('GET /api/readings/:id returns word-level tokens', async () => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO readings (hsk_level, format, title, content, pinyin_text, questions, source_model)
      VALUES (1, 'short_text', '你好朋友', '你好，朋友。', 'Nǐ hǎo, péngyou.', '[]', 'seed')
    `).run();

    const response = await request(app, 'GET', `/api/readings/${lastInsertRowid}`);

    expect(response.status).toBe(200);
    expect(response.body.tokens.map((token) => token.text)).toEqual(['你好', '，', '朋友', '。']);
    expect(response.body.tokens[0].word.meaning_en).toContain('hello');
  });
});