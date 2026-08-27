-- Adds "uplock" as a request type (the inverse of downlock — asking for a place's or
-- segment's lock level to be raised rather than lowered) and as a notification channel /
-- push subscription event type, so a channel or subscription can be scoped to fire only for
-- it. SQLite can't ALTER a CHECK constraint in place, so all three tables carrying a type/
-- event_type CHECK are recreated, same recipe as 0005/0008/0014/0016/0017/0018.
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE requests_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id   INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  region_id    INTEGER REFERENCES regions(id) ON DELETE SET NULL,
  type         TEXT    NOT NULL CHECK(type IN ('downlock','uplock','imagery','accept_pur','decline_pur')),
  permalink    TEXT    NOT NULL,
  lock_level   INTEGER,     -- inferred from the selected WME segment/place; downlock, uplock and PUR only
  editor_rank  INTEGER,
  status       TEXT    NOT NULL DEFAULT 'pending'
                             CHECK(status IN ('pending','in_progress','completed','rejected')),
  notes        TEXT,
  submitted_by TEXT,
  screenshot_key TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO requests_new
  (id, country_id, region_id, type, permalink, lock_level, editor_rank, status, notes,
   submitted_by, screenshot_key, created_at, updated_at)
  SELECT id, country_id, region_id, type, permalink, lock_level, editor_rank, status, notes,
         submitted_by, screenshot_key, created_at, updated_at
  FROM requests;

DROP TABLE requests;
ALTER TABLE requests_new RENAME TO requests;

CREATE INDEX IF NOT EXISTS idx_requests_country ON requests(country_id);
CREATE INDEX IF NOT EXISTS idx_requests_type    ON requests(type);
CREATE INDEX IF NOT EXISTS idx_requests_status  ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_region  ON requests(region_id);

CREATE TABLE notification_channels_new (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id             INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  region_id              INTEGER REFERENCES regions(id) ON DELETE CASCADE,
  label                  TEXT    NOT NULL,
  platform               TEXT    NOT NULL CHECK(platform IN ('slack','slack_threaded','discord','telegram','email','webhook','google_sheets','google_chat','ntfy','gotify')),
  event_type             TEXT    NOT NULL CHECK(event_type IN ('global','downlock','uplock','imagery','accept_pur','decline_pur')),
  webhook_url            TEXT,
  bot_token              TEXT,
  chat_id                TEXT,
  custom_prefix          TEXT,
  email_to               TEXT,
  discord_forum          INTEGER NOT NULL DEFAULT 0,
  spreadsheet_id         TEXT,
  sheet_name             TEXT,
  google_credential_id   INTEGER REFERENCES credentials(id),
  email_credential_id    INTEGER REFERENCES credentials(id),
  last_thread_submitted_by TEXT,
  last_thread_ts            TEXT,
  last_thread_day           TEXT,
  created_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO notification_channels_new
  (id, country_id, region_id, label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to,
   discord_forum, spreadsheet_id, sheet_name, google_credential_id, email_credential_id,
   last_thread_submitted_by, last_thread_ts, last_thread_day, created_at)
  SELECT id, country_id, region_id, label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to,
         discord_forum, spreadsheet_id, sheet_name, google_credential_id, email_credential_id,
         last_thread_submitted_by, last_thread_ts, last_thread_day, created_at
  FROM notification_channels;

DROP TABLE notification_channels;
ALTER TABLE notification_channels_new RENAME TO notification_channels;

CREATE INDEX IF NOT EXISTS idx_channels_country ON notification_channels(country_id);
CREATE INDEX IF NOT EXISTS idx_channels_region  ON notification_channels(region_id);

CREATE TABLE push_subscriptions_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  region_id  INTEGER REFERENCES regions(id) ON DELETE CASCADE,
  event_type TEXT    NOT NULL DEFAULT 'global' CHECK(event_type IN ('global', 'downlock', 'uplock', 'imagery', 'accept_pur', 'decline_pur')),
  endpoint   TEXT    NOT NULL,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO push_subscriptions_new
  (id, user_id, country_id, region_id, event_type, endpoint, p256dh, auth, created_at)
  SELECT id, user_id, country_id, region_id, event_type, endpoint, p256dh, auth, created_at
  FROM push_subscriptions;

DROP TABLE push_subscriptions;
ALTER TABLE push_subscriptions_new RENAME TO push_subscriptions;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user  ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_scope ON push_subscriptions(country_id, region_id);
