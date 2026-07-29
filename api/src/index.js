'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const countriesRouter = require('./routes/countries');
const channelsRouter = require('./routes/channels');
const requestsRouter = require('./routes/requests');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS === '*' ? '*' : process.env.ALLOWED_ORIGINS?.split(','),
}));
app.use(express.json());

// Serve the dashboard static files
app.use(express.static(path.join(__dirname, '../../dashboard')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/countries', countriesRouter);

// Channels nested under countries AND at the flat /api/channels/:id level
app.use('/api/countries/:countryId/channels', channelsRouter);
app.use('/api/channels', channelsRouter);

app.use('/api/requests', requestsRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`WME Requests API listening on port ${PORT}`);
  });
}

module.exports = app;
