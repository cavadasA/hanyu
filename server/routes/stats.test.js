import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createStatsRouter } from './stats.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/stats', createStatsRouter(db));
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

describe('Stats API', () => {
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

  it('GET /api/stats/dashboard returns dashboard data', async () => {
    const response = await request(app, 'GET', '/api/stats/dashboard');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('streak');
    expect(response.body).toHaveProperty('cards');
    expect(response.body).toHaveProperty('heatmap');
  });

  it('GET /api/stats/streak returns streak info', async () => {
    const response = await request(app, 'GET', '/api/stats/streak');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('current');
    expect(response.body).toHaveProperty('longest');
  });

  it('POST /api/stats/log-time logs study time', async () => {
    const response = await request(app, 'POST', '/api/stats/log-time', { ms: 60000 });

    expect(response.status).toBe(200);
    expect(response.body.time_spent_ms).toBeGreaterThanOrEqual(60000);
  });

  it('GET /api/stats/dashboard includes learning curve', async () => {
    const response = await request(app, 'GET', '/api/stats/dashboard');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('learning_curve');
    expect(response.body.learning_curve).toBeInstanceOf(Array);
  });

  it('GET /api/stats/dashboard includes exercise stats', async () => {
    const response = await request(app, 'GET', '/api/stats/dashboard');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('exercise_stats');
    expect(response.body.exercise_stats).toHaveProperty('by_type');
  });

  it('GET /api/stats/dashboard includes time periods', async () => {
    const response = await request(app, 'GET', '/api/stats/dashboard');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('time');
    expect(response.body.time).toHaveProperty('today_ms');
    expect(response.body.time).toHaveProperty('week_ms');
    expect(response.body.time).toHaveProperty('all_time_ms');
  });
});