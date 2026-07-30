-- WME Requests — initial D1 schema
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE IF NOT EXISTS countries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  code       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Notification channels (Slack / Discord / Telegram)
-- event_type = 'global'   → fires for every request in this country
-- event_type = 'downlock' → fires only for downlock requests
-- event_type = 'imagery'  → fires only for imagery requests
-- A country may have many channels; multiple channels per event_type are allowed.
CREATE TABLE IF NOT EXISTS notification_channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id  INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  platform    TEXT    NOT NULL CHECK(platform IN ('slack','discord','telegram')),
  event_type  TEXT    NOT NULL CHECK(event_type IN ('global','downlock','imagery')),
  webhook_url TEXT,         -- Slack / Discord incoming-webhook URL
  bot_token   TEXT,         -- Telegram bot token
  chat_id     TEXT,         -- Telegram chat / channel ID
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id   INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL CHECK(type IN ('downlock','imagery')),
  permalink    TEXT    NOT NULL,
  lock_level   INTEGER,     -- inferred from the selected WME segment; downlock only
  status       TEXT    NOT NULL DEFAULT 'pending'
                             CHECK(status IN ('pending','in_progress','completed','rejected')),
  notes        TEXT,
  submitted_by TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_requests_country ON requests(country_id);
CREATE INDEX IF NOT EXISTS idx_requests_type    ON requests(type);
CREATE INDEX IF NOT EXISTS idx_requests_status  ON requests(status);
CREATE INDEX IF NOT EXISTS idx_channels_country ON notification_channels(country_id);
