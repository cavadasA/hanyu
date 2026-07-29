import { Router } from 'express';

function redactSettings(settings) {
  return {
    ...settings,
    api_key: '',
    api_key_configured: Boolean(settings.api_key),
  };
}

export function createSettingsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const user = db.prepare('SELECT settings FROM users WHERE id = 1').get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(redactSettings(JSON.parse(user.settings)));
  });

  router.put('/', (req, res) => {
    const user = db.prepare('SELECT settings FROM users WHERE id = 1').get();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const current = JSON.parse(user.settings);
    const updated = { ...current, ...req.body };

    if (updated.ai_provider === 'none') {
      updated.api_key = '';
    } else if (req.body.clear_api_key === true) {
      updated.api_key = '';
    } else if (req.body.api_key === '') {
      if (req.body.ai_provider && req.body.ai_provider !== current.ai_provider) {
        updated.api_key = '';
      } else {
        updated.api_key = current.api_key || '';
      }
    }

    if (updated.cards_per_day !== undefined) {
      updated.cards_per_day = Math.max(1, Math.min(200, parseInt(updated.cards_per_day, 10) || 20));
    }

    if (updated.current_level !== undefined) {
      updated.current_level = Math.max(1, Math.min(3, parseInt(updated.current_level, 10) || 1));
    }

    if (updated.theme && !['light', 'dark'].includes(updated.theme)) {
      updated.theme = 'light';
    }

    db.prepare('UPDATE users SET settings = ? WHERE id = 1').run(JSON.stringify(updated));
    res.json(redactSettings(updated));
  });

  return router;
}