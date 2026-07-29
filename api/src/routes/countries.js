'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const { getDb } = require('../db/database');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// GET /api/countries
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM countries ORDER BY name ASC')
    .all();
  res.json(rows);
});

// GET /api/countries/:id
router.get(
  '/:id',
  param('id').isInt({ min: 1 }),
  validate,
  (req, res) => {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM countries WHERE id = ?')
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Country not found' });
    res.json(row);
  }
);

// POST /api/countries
router.post(
  '/',
  body('name').trim().notEmpty().withMessage('name is required'),
  body('code').trim().notEmpty().withMessage('code is required')
    .isLength({ min: 2, max: 10 }).withMessage('code must be 2–10 characters'),
  validate,
  (req, res) => {
    const db = getDb();
    const { name, code } = req.body;
    try {
      const result = db
        .prepare('INSERT INTO countries (name, code) VALUES (?, ?)')
        .run(name, code.toUpperCase());
      const row = db.prepare('SELECT * FROM countries WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(row);
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Country code already exists' });
      }
      throw err;
    }
  }
);

// PUT /api/countries/:id
router.put(
  '/:id',
  param('id').isInt({ min: 1 }),
  body('name').optional().trim().notEmpty(),
  body('code').optional().trim().isLength({ min: 2, max: 10 }),
  validate,
  (req, res) => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM countries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Country not found' });

    const name = req.body.name ?? existing.name;
    const code = req.body.code ? req.body.code.toUpperCase() : existing.code;

    try {
      db.prepare('UPDATE countries SET name = ?, code = ? WHERE id = ?').run(name, code, req.params.id);
      const row = db.prepare('SELECT * FROM countries WHERE id = ?').get(req.params.id);
      res.json(row);
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Country code already exists' });
      }
      throw err;
    }
  }
);

// DELETE /api/countries/:id
router.delete(
  '/:id',
  param('id').isInt({ min: 1 }),
  validate,
  (req, res) => {
    const db = getDb();
    const result = db.prepare('DELETE FROM countries WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Country not found' });
    res.status(204).send();
  }
);

module.exports = router;
