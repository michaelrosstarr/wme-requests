-- Adds "ntfy" and "gotify" as notification channel platforms — both self-hosted-friendly
-- push services. Both reuse existing columns: webhook_url holds the ntfy topic URL / Gotify
-- server URL, bot_token holds the (optional, for ntfy) auth token / (required, for Gotify)
-- application token. SQLite can't ALTER a CHECK constraint in place, so the platform check is
-- widened by recreating the table, same as 0005/0008/0014.
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE notification_channels_new (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id           INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  region_id             INTEGER REFERENCES regions(id) ON DELETE CASCADE,
  label                TEXT    NOT NULL,
  platform             TEXT    NOT NULL CHECK(platform IN ('slack','discord','telegram','email','webhook','google_sheets','google_chat','ntfy','gotify')),
  event_type           TEXT    NOT NULL CHECK(event_type IN ('global','downlock','imagery')),
  webhook_url          TEXT,
  bot_token            TEXT,
  chat_id              TEXT,
  custom_prefix        TEXT,
  email_to             TEXT,
  discord_forum        INTEGER NOT NULL DEFAULT 0,
  spreadsheet_id       TEXT,
  sheet_name           TEXT,
  google_credential_id INTEGER REFERENCES credentials(id),
  email_credential_id  INTEGER REFERENCES credentials(id),
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO notification_channels_new
  (id, country_id, region_id, label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to,
   discord_forum, spreadsheet_id, sheet_name, google_credential_id, email_credential_id, created_at)
  SELECT id, country_id, region_id, label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to,
         discord_forum, spreadsheet_id, sheet_name, google_credential_id, email_credential_id, created_at
  FROM notification_channels;

DROP TABLE notification_channels;
ALTER TABLE notification_channels_new RENAME TO notification_channels;

CREATE INDEX IF NOT EXISTS idx_channels_country ON notification_channels(country_id);
