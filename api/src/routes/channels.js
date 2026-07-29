'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const { getDb } = require('../db/database');

const router = Router({ mergeParams: true });

const PLATFORMS = ['slack', 'discord', 'telegram'];
const EVENT_TYPES = ['global', 'downlock', 'imagery'];

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// GET /api/countries/:countryId/channels
router.get('/', (req, res) => {
  const db = getDb();
  const country = db.prepare('SELECT id FROM countries WHERE id = ?').get(req.params.countryId);
  if (!country) return res.status(404).json({ error: 'Country not found' });

  const rows = db
    .prepare('SELECT * FROM notification_channels WHERE country_id = ? ORDER BY event_type, platform')
    .all(req.params.countryId);
  res.json(rows);
});

// POST /api/countries/:countryId/channels
router.post(
  '/',
  param('countryId').isInt({ min: 1 }),
  body('label').trim().notEmpty().withMessage('label is required'),
  body('platform').isIn(PLATFORMS).withMessage(`platform must be one of: ${PLATFORMS.join(', ')}`),
  body('event_type').isIn(EVENT_TYPES).withMessage(`event_type must be one of: ${EVENT_TYPES.join(', ')}`),
  body('webhook_url').optional({ nullable: true }).isURL().withMessage('webhook_url must be a valid URL'),
  body('bot_token').optional({ nullable: true }).isString(),
  body('chat_id').optional({ nullable: true }).isString(),
  validate,
  (req, res) => {
    const db = getDb();
    const country = db.prepare('SELECT id FROM countries WHERE id = ?').get(req.params.countryId);
    if (!country) return res.status(404).json({ error: 'Country not found' });

    const { label, platform, event_type, webhook_url, bot_token, chat_id } = req.body;

    // Platform-specific validation
    if ((platform === 'slack' || platform === 'discord') && !webhook_url) {
      return res.status(400).json({ error: `webhook_url is required for ${platform}` });
    }
    if (platform === 'telegram' && (!bot_token || !chat_id)) {
      return res.status(400).json({ error: 'bot_token and chat_id are required for telegram' });
    }

    const result = db
      .prepare(
        `INSERT INTO notification_channels
         (country_id, label, platform, event_type, webhook_url, bot_token, chat_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.params.countryId, label, platform, event_type, webhook_url || null, bot_token || null, chat_id || null);

    const row = db
      .prepare('SELECT * FROM notification_channels WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json(row);
  }
);

// PUT /api/channels/:id  (flat route, mounted separately)
router.put(
  '/:id',
  param('id').isInt({ min: 1 }),
  body('label').optional().trim().notEmpty(),
  body('platform').optional().isIn(PLATFORMS),
  body('event_type').optional().isIn(EVENT_TYPES),
  body('webhook_url').optional({ nullable: true }).isURL(),
  body('bot_token').optional({ nullable: true }).isString(),
  body('chat_id').optional({ nullable: true }).isString(),
  validate,
  (req, res) => {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM notification_channels WHERE id = ?')
      .get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Channel not found' });

    const label = req.body.label ?? existing.label;
    const platform = req.body.platform ?? existing.platform;
    const event_type = req.body.event_type ?? existing.event_type;
    const webhook_url = req.body.webhook_url !== undefined ? req.body.webhook_url : existing.webhook_url;
    const bot_token = req.body.bot_token !== undefined ? req.body.bot_token : existing.bot_token;
    const chat_id = req.body.chat_id !== undefined ? req.body.chat_id : existing.chat_id;

    db.prepare(
      `UPDATE notification_channels
       SET label = ?, platform = ?, event_type = ?, webhook_url = ?, bot_token = ?, chat_id = ?
       WHERE id = ?`
    ).run(label, platform, event_type, webhook_url, bot_token, chat_id, req.params.id);

    const row = db
      .prepare('SELECT * FROM notification_channels WHERE id = ?')
      .get(req.params.id);
    res.json(row);
  }
);

// DELETE /api/channels/:id
router.delete(
  '/:id',
  param('id').isInt({ min: 1 }),
  validate,
  (req, res) => {
    const db = getDb();
    const result = db
      .prepare('DELETE FROM notification_channels WHERE id = ?')
      .run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Channel not found' });
    res.status(204).send();
  }
);

module.exports = router;
