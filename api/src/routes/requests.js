'use strict';

const { Router } = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { sendNotifications } = require('../services/notifications');

const router = Router();

const REQUEST_TYPES = ['downlock', 'imagery'];
const REQUEST_STATUSES = ['pending', 'in_progress', 'completed', 'rejected'];

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// GET /api/requests
// Query params: country_id, type, status, limit, offset
router.get(
  '/',
  query('country_id').optional().isInt({ min: 1 }),
  query('type').optional().isIn(REQUEST_TYPES),
  query('status').optional().isIn(REQUEST_STATUSES),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('offset').optional().isInt({ min: 0 }),
  validate,
  (req, res) => {
    const db = getDb();
    const conditions = [];
    const params = [];

    if (req.query.country_id) {
      conditions.push('r.country_id = ?');
      params.push(req.query.country_id);
    }
    if (req.query.type) {
      conditions.push('r.type = ?');
      params.push(req.query.type);
    }
    if (req.query.status) {
      conditions.push('r.status = ?');
      params.push(req.query.status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const rows = db
      .prepare(
        `SELECT r.*, c.name AS country_name, c.code AS country_code
         FROM requests r
         JOIN countries c ON c.id = r.country_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM requests r ${where}`)
      .get(...params).count;

    res.json({ total, limit, offset, data: rows });
  }
);

// GET /api/requests/:id
router.get(
  '/:id',
  param('id').isInt({ min: 1 }),
  validate,
  (req, res) => {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT r.*, c.name AS country_name, c.code AS country_code
         FROM requests r
         JOIN countries c ON c.id = r.country_id
         WHERE r.id = ?`
      )
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Request not found' });
    res.json(row);
  }
);

// POST /api/requests
router.post(
  '/',
  body('country_id').isInt({ min: 1 }).withMessage('country_id is required'),
  body('type').isIn(REQUEST_TYPES).withMessage(`type must be one of: ${REQUEST_TYPES.join(', ')}`),
  body('permalink').trim().notEmpty().withMessage('permalink is required'),
  body('lock_level').optional({ nullable: true }).isInt({ min: 1, max: 7 })
    .withMessage('lock_level must be between 1 and 7'),
  body('notes').optional({ nullable: true }).isString(),
  body('submitted_by').optional({ nullable: true }).trim().isString(),
  validate,
  async (req, res) => {
    const db = getDb();
    const { country_id, type, permalink, lock_level, notes, submitted_by } = req.body;

    const country = db.prepare('SELECT * FROM countries WHERE id = ?').get(country_id);
    if (!country) return res.status(404).json({ error: 'Country not found' });

    // lock_level is only meaningful for downlock requests
    const effectiveLockLevel = type === 'downlock' ? (lock_level ?? null) : null;

    const result = db
      .prepare(
        `INSERT INTO requests (country_id, type, permalink, lock_level, notes, submitted_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(country_id, type, permalink, effectiveLockLevel, notes || null, submitted_by || null);

    const row = db
      .prepare(
        `SELECT r.*, c.name AS country_name, c.code AS country_code
         FROM requests r JOIN countries c ON c.id = r.country_id
         WHERE r.id = ?`
      )
      .get(result.lastInsertRowid);

    // Fire notifications asynchronously — don't block the HTTP response
    sendNotifications(db, row, country.name).catch((err) => {
      console.error('[notifications] Unhandled error:', err.message);
    });

    res.status(201).json(row);
  }
);

// PUT /api/requests/:id  — update status or notes
router.put(
  '/:id',
  param('id').isInt({ min: 1 }),
  body('status').optional().isIn(REQUEST_STATUSES).withMessage(`status must be one of: ${REQUEST_STATUSES.join(', ')}`),
  body('notes').optional({ nullable: true }).isString(),
  validate,
  (req, res) => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Request not found' });

    const status = req.body.status ?? existing.status;
    const notes = req.body.notes !== undefined ? req.body.notes : existing.notes;

    db.prepare(
      `UPDATE requests SET status = ?, notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    ).run(status, notes, req.params.id);

    const row = db
      .prepare(
        `SELECT r.*, c.name AS country_name, c.code AS country_code
         FROM requests r JOIN countries c ON c.id = r.country_id
         WHERE r.id = ?`
      )
      .get(req.params.id);
    res.json(row);
  }
);

// DELETE /api/requests/:id
router.delete(
  '/:id',
  param('id').isInt({ min: 1 }),
  validate,
  (req, res) => {
    const db = getDb();
    const result = db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Request not found' });
    res.status(204).send();
  }
);

module.exports = router;
