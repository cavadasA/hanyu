import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createTestDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { createSettingsRouter } from './settings.js';

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', createSettingsRouter(db));
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

describe('Settings API', () => {
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

  it('GET /api/settings returns user settings', async () => {
    const response = await request(app, 'GET', '/api/settings');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('theme');
    expect(response.body).toHaveProperty('current_level');
    expect(response.body).toHaveProperty('cards_per_day');
  });

  it('PUT /api/settings updates settings', async () => {
    const response = await request(app, 'PUT', '/api/settings', { theme: 'dark', cards_per_day: 30 });

    expect(response.status).toBe(200);
    expect(response.body.theme).toBe('dark');
    expect(response.body.cards_per_day).toBe(30);

    const getResponse = await request(app, 'GET', '/api/settings');
    expect(getResponse.body.theme).toBe('dark');
  });
});