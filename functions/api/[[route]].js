/**
 * functions/api/[[route]].js
 *
 * Cloudflare Pages catch-all function that handles every /api/* request.
 * Bound resources (set in wrangler.toml):
 *   - env.DB  — Cloudflare D1 database
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = (allowedOrigins) => ({
  'Access-Control-Allow-Origin': allowedOrigins || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

function err(message, status = 400, extra = {}) {
  return json({ error: message }, status, extra);
}

function withCors(response, origins) {
  const cors = CORS_HEADERS(origins);
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

/** Parse a URL path into segments, e.g. '/countries/3/channels' → ['countries','3','channels'] */
function segments(path) {
  return path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

// ── D1 helpers ────────────────────────────────────────────────────────────────

async function dbAll(db, sql, params = []) {
  const { results } = await db.prepare(sql).bind(...params).all();
  return results;
}

async function dbFirst(db, sql, params = []) {
  return db.prepare(sql).bind(...params).first();
}

async function dbRun(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

// ── Validation helpers ────────────────────────────────────────────────────────

const PLATFORMS = ['slack', 'discord', 'telegram'];
const EVENT_TYPES = ['global', 'downlock', 'imagery'];
const REQUEST_TYPES = ['downlock', 'imagery'];
const STATUSES = ['pending', 'in_progress', 'completed', 'rejected'];

function isURL(s) {
  try { new URL(s); return true; } catch { return false; }
}

// ── Notification service ──────────────────────────────────────────────────────

function buildMessage(request, countryName) {
  const typeLabel = request.type === 'downlock' ? '🔒 Downlock Request' : '🖼️ Imagery Request';
  const lockInfo = request.type === 'downlock' && request.lock_level != null
    ? `\nLock Level: ${request.lock_level}` : '';
  const submitter = request.submitted_by ? `\nSubmitted by: ${request.submitted_by}` : '';
  const notes = request.notes ? `\nNotes: ${request.notes}` : '';
  const title = `${typeLabel} — ${countryName}`;
  const body = `Permalink: ${request.permalink}${lockInfo}${submitter}${notes}`;
  const color = request.type === 'downlock' ? 0xe74c3c : 0x3498db;
  return { title, body, color };
}

async function sendSlack(webhookUrl, msg) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `*${msg.title}*\n${msg.body}` }),
  });
}

async function sendDiscord(webhookUrl, msg) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{ title: msg.title, description: msg.body, color: msg.color, timestamp: new Date().toISOString() }],
    }),
  });
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function sendTelegram(botToken, chatId, msg) {
  const text = `*${escapeMarkdown(msg.title)}*\n${escapeMarkdown(msg.body)}`;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
  });
}

async function dispatchChannel(channel, msg) {
  try {
    if (channel.platform === 'slack')    await sendSlack(channel.webhook_url, msg);
    if (channel.platform === 'discord')  await sendDiscord(channel.webhook_url, msg);
    if (channel.platform === 'telegram') await sendTelegram(channel.bot_token, channel.chat_id, msg);
    return { id: channel.id, ok: true };
  } catch (e) {
    return { id: channel.id, ok: false, error: e.message };
  }
}

async function fireNotifications(db, request, countryName) {
  const channels = await dbAll(
    db,
    `SELECT * FROM notification_channels WHERE country_id = ? AND event_type IN ('global', ?)`,
    [request.country_id, request.type],
  );
  if (!channels.length) return;
  const msg = buildMessage(request, countryName);
  await Promise.allSettled(channels.map((ch) => dispatchChannel(ch, msg)));
}

// ── Route handlers ────────────────────────────────────────────────────────────

// --- Countries ---

async function getCountries(db) {
  const rows = await dbAll(db, 'SELECT * FROM countries ORDER BY name ASC');
  return json(rows);
}

async function getCountry(db, id) {
  const row = await dbFirst(db, 'SELECT * FROM countries WHERE id = ?', [id]);
  if (!row) return err('Country not found', 404);
  return json(row);
}

async function createCountry(db, body) {
  const { name, code } = body;
  if (!name?.trim())  return err('name is required');
  if (!code?.trim())  return err('code is required');
  if (code.trim().length < 2 || code.trim().length > 10) return err('code must be 2–10 characters');
  try {
    const result = await dbRun(
      db,
      'INSERT INTO countries (name, code) VALUES (?, ?)',
      [name.trim(), code.trim().toUpperCase()],
    );
    const row = await dbFirst(db, 'SELECT * FROM countries WHERE id = ?', [result.meta.last_row_id]);
    return json(row, 201);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return err('Country code already exists', 409);
    throw e;
  }
}

async function updateCountry(db, id, body) {
  const existing = await dbFirst(db, 'SELECT * FROM countries WHERE id = ?', [id]);
  if (!existing) return err('Country not found', 404);
  const name = body.name?.trim() || existing.name;
  const code = body.code?.trim() ? body.code.trim().toUpperCase() : existing.code;
  try {
    await dbRun(db, 'UPDATE countries SET name = ?, code = ? WHERE id = ?', [name, code, id]);
    const row = await dbFirst(db, 'SELECT * FROM countries WHERE id = ?', [id]);
    return json(row);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return err('Country code already exists', 409);
    throw e;
  }
}

async function deleteCountry(db, id) {
  const result = await dbRun(db, 'DELETE FROM countries WHERE id = ?', [id]);
  if (!result.meta.changes) return err('Country not found', 404);
  return new Response(null, { status: 204 });
}

// --- Channels ---

async function getChannels(db, countryId) {
  const country = await dbFirst(db, 'SELECT id FROM countries WHERE id = ?', [countryId]);
  if (!country) return err('Country not found', 404);
  const rows = await dbAll(
    db,
    'SELECT * FROM notification_channels WHERE country_id = ? ORDER BY event_type, platform',
    [countryId],
  );
  return json(rows);
}

async function createChannel(db, countryId, body) {
  const country = await dbFirst(db, 'SELECT id FROM countries WHERE id = ?', [countryId]);
  if (!country) return err('Country not found', 404);

  const { label, platform, event_type, webhook_url, bot_token, chat_id } = body;
  if (!label?.trim())                 return err('label is required');
  if (!PLATFORMS.includes(platform))  return err(`platform must be one of: ${PLATFORMS.join(', ')}`);
  if (!EVENT_TYPES.includes(event_type)) return err(`event_type must be one of: ${EVENT_TYPES.join(', ')}`);

  if ((platform === 'slack' || platform === 'discord')) {
    if (!webhook_url) return err(`webhook_url is required for ${platform}`);
    if (!isURL(webhook_url)) return err('webhook_url must be a valid URL');
  }
  if (platform === 'telegram') {
    if (!bot_token || !chat_id) return err('bot_token and chat_id are required for telegram');
  }

  const result = await dbRun(
    db,
    `INSERT INTO notification_channels (country_id, label, platform, event_type, webhook_url, bot_token, chat_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [countryId, label.trim(), platform, event_type, webhook_url || null, bot_token || null, chat_id || null],
  );
  const row = await dbFirst(db, 'SELECT * FROM notification_channels WHERE id = ?', [result.meta.last_row_id]);
  return json(row, 201);
}

async function updateChannel(db, id, body) {
  const existing = await dbFirst(db, 'SELECT * FROM notification_channels WHERE id = ?', [id]);
  if (!existing) return err('Channel not found', 404);

  const label      = body.label?.trim()    || existing.label;
  const platform   = PLATFORMS.includes(body.platform)   ? body.platform   : existing.platform;
  const event_type = EVENT_TYPES.includes(body.event_type) ? body.event_type : existing.event_type;
  const webhook_url = body.webhook_url !== undefined ? body.webhook_url : existing.webhook_url;
  const bot_token   = body.bot_token   !== undefined ? body.bot_token   : existing.bot_token;
  const chat_id     = body.chat_id     !== undefined ? body.chat_id     : existing.chat_id;

  await dbRun(
    db,
    `UPDATE notification_channels
     SET label=?, platform=?, event_type=?, webhook_url=?, bot_token=?, chat_id=?
     WHERE id=?`,
    [label, platform, event_type, webhook_url, bot_token, chat_id, id],
  );
  const row = await dbFirst(db, 'SELECT * FROM notification_channels WHERE id = ?', [id]);
  return json(row);
}

async function deleteChannel(db, id) {
  const result = await dbRun(db, 'DELETE FROM notification_channels WHERE id = ?', [id]);
  if (!result.meta.changes) return err('Channel not found', 404);
  return new Response(null, { status: 204 });
}

// --- Requests ---

async function getRequests(db, searchParams) {
  const conditions = [];
  const params = [];

  const countryId = searchParams.get('country_id');
  const type      = searchParams.get('type');
  const status    = searchParams.get('status');

  if (countryId) { conditions.push('r.country_id = ?'); params.push(parseInt(countryId)); }
  if (type && REQUEST_TYPES.includes(type))  { conditions.push('r.type = ?');   params.push(type); }
  if (status && STATUSES.includes(status))   { conditions.push('r.status = ?'); params.push(status); }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit  = Math.min(parseInt(searchParams.get('limit'))  || 50, 200);
  const offset = Math.max(parseInt(searchParams.get('offset')) || 0, 0);

  const rows = await dbAll(
    db,
    `SELECT r.*, c.name AS country_name, c.code AS country_code
     FROM requests r JOIN countries c ON c.id = r.country_id
     ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const totalRow = await dbFirst(
    db,
    `SELECT COUNT(*) AS count FROM requests r ${where}`,
    params,
  );
  return json({ total: totalRow.count, limit, offset, data: rows });
}

async function getRequest(db, id) {
  const row = await dbFirst(
    db,
    `SELECT r.*, c.name AS country_name, c.code AS country_code
     FROM requests r JOIN countries c ON c.id = r.country_id WHERE r.id = ?`,
    [id],
  );
  if (!row) return err('Request not found', 404);
  return json(row);
}

async function createRequest(db, body, ctx) {
  const { country_id, type, permalink, lock_level, notes, submitted_by } = body;

  if (!country_id || !Number.isInteger(Number(country_id))) return err('country_id is required');
  if (!REQUEST_TYPES.includes(type)) return err(`type must be one of: ${REQUEST_TYPES.join(', ')}`);
  if (!permalink?.trim()) return err('permalink is required');
  if (lock_level != null && (lock_level < 1 || lock_level > 7))
    return err('lock_level must be between 1 and 7');

  const country = await dbFirst(db, 'SELECT * FROM countries WHERE id = ?', [Number(country_id)]);
  if (!country) return err('Country not found', 404);

  const effectiveLock = type === 'downlock' ? (lock_level ?? null) : null;

  const result = await dbRun(
    db,
    `INSERT INTO requests (country_id, type, permalink, lock_level, notes, submitted_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [Number(country_id), type, permalink.trim(), effectiveLock, notes || null, submitted_by?.trim() || null],
  );

  const row = await dbFirst(
    db,
    `SELECT r.*, c.name AS country_name, c.code AS country_code
     FROM requests r JOIN countries c ON c.id = r.country_id WHERE r.id = ?`,
    [result.meta.last_row_id],
  );

  // Fire notifications in the background (non-blocking)
  ctx.waitUntil(fireNotifications(db, row, country.name));

  return json(row, 201);
}

async function updateRequest(db, id, body) {
  const existing = await dbFirst(db, 'SELECT * FROM requests WHERE id = ?', [id]);
  if (!existing) return err('Request not found', 404);

  const status = STATUSES.includes(body.status) ? body.status : existing.status;
  const notes  = body.notes !== undefined ? body.notes : existing.notes;

  await dbRun(
    db,
    `UPDATE requests SET status=?, notes=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
    [status, notes, id],
  );
  const row = await dbFirst(
    db,
    `SELECT r.*, c.name AS country_name, c.code AS country_code
     FROM requests r JOIN countries c ON c.id = r.country_id WHERE r.id = ?`,
    [id],
  );
  return json(row);
}

async function deleteRequest(db, id) {
  const result = await dbRun(db, 'DELETE FROM requests WHERE id = ?', [id]);
  if (!result.meta.changes) return err('Request not found', 404);
  return new Response(null, { status: 204 });
}

// ── Main router ───────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();
  const db     = env.DB;
  const origins = env.ALLOWED_ORIGINS || '*';

  // CORS pre-flight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS(origins) });
  }

  // Strip the /api prefix and split path into segments
  const rawPath = url.pathname.replace(/^\/api\/?/, '');
  const segs    = segments(rawPath);

  // Wrap every route so CORS headers are always added
  const handle = async () => {
    try {
      // GET /api/health
      if (method === 'GET' && segs.length === 1 && segs[0] === 'health') {
        return json({ status: 'ok', ts: new Date().toISOString() });
      }

      // ── Countries ─────────────────────────────────────────────────────────
      // GET    /api/countries
      if (method === 'GET' && segs.length === 1 && segs[0] === 'countries') {
        return getCountries(db);
      }
      // POST   /api/countries
      if (method === 'POST' && segs.length === 1 && segs[0] === 'countries') {
        const body = await request.json().catch(() => ({}));
        return createCountry(db, body);
      }
      // GET    /api/countries/:id
      if (method === 'GET' && segs.length === 2 && segs[0] === 'countries') {
        return getCountry(db, parseInt(segs[1]));
      }
      // PUT    /api/countries/:id
      if (method === 'PUT' && segs.length === 2 && segs[0] === 'countries') {
        const body = await request.json().catch(() => ({}));
        return updateCountry(db, parseInt(segs[1]), body);
      }
      // DELETE /api/countries/:id
      if (method === 'DELETE' && segs.length === 2 && segs[0] === 'countries') {
        return deleteCountry(db, parseInt(segs[1]));
      }

      // ── Channels (nested under country) ───────────────────────────────────
      // GET    /api/countries/:countryId/channels
      if (method === 'GET' && segs.length === 3 && segs[0] === 'countries' && segs[2] === 'channels') {
        return getChannels(db, parseInt(segs[1]));
      }
      // POST   /api/countries/:countryId/channels
      if (method === 'POST' && segs.length === 3 && segs[0] === 'countries' && segs[2] === 'channels') {
        const body = await request.json().catch(() => ({}));
        return createChannel(db, parseInt(segs[1]), body);
      }

      // ── Channels (flat) ───────────────────────────────────────────────────
      // PUT    /api/channels/:id
      if (method === 'PUT' && segs.length === 2 && segs[0] === 'channels') {
        const body = await request.json().catch(() => ({}));
        return updateChannel(db, parseInt(segs[1]), body);
      }
      // DELETE /api/channels/:id
      if (method === 'DELETE' && segs.length === 2 && segs[0] === 'channels') {
        return deleteChannel(db, parseInt(segs[1]));
      }

      // ── Requests ──────────────────────────────────────────────────────────
      // GET    /api/requests
      if (method === 'GET' && segs.length === 1 && segs[0] === 'requests') {
        return getRequests(db, url.searchParams);
      }
      // POST   /api/requests
      if (method === 'POST' && segs.length === 1 && segs[0] === 'requests') {
        const body = await request.json().catch(() => ({}));
        return createRequest(db, body, { waitUntil });
      }
      // GET    /api/requests/:id
      if (method === 'GET' && segs.length === 2 && segs[0] === 'requests') {
        return getRequest(db, parseInt(segs[1]));
      }
      // PUT    /api/requests/:id
      if (method === 'PUT' && segs.length === 2 && segs[0] === 'requests') {
        const body = await request.json().catch(() => ({}));
        return updateRequest(db, parseInt(segs[1]), body);
      }
      // DELETE /api/requests/:id
      if (method === 'DELETE' && segs.length === 2 && segs[0] === 'requests') {
        return deleteRequest(db, parseInt(segs[1]));
      }

      return err('Not found', 404);
    } catch (e) {
      console.error(e);
      return err('Internal server error', 500);
    }
  };

  const response = await handle();
  return withCors(response, origins);
}
