-- Adds "google_sheets" as a notification channel platform — appends a row to a Google
-- Sheet via a service account (see GOOGLE_SERVICE_ACCOUNT_JSON in DEPLOYMENT.md) on every
-- matching request. SQLite can't ALTER a CHECK constraint in place, so the platform check
-- is widened by recreating the table, same as 0005_channel_email.sql.
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE notification_channels_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id     INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  label          TEXT    NOT NULL,
  platform       TEXT    NOT NULL CHECK(platform IN ('slack','discord','telegram','email','webhook','google_sheets')),
  event_type     TEXT    NOT NULL CHECK(event_type IN ('global','downlock','imagery')),
  webhook_url    TEXT,         -- Slack / Discord incoming-webhook URL
  bot_token      TEXT,         -- Telegram bot token
  chat_id        TEXT,         -- Telegram chat / channel ID
  custom_prefix  TEXT,
  email_to       TEXT,         -- Recipient address for the "email" platform
  discord_forum  INTEGER NOT NULL DEFAULT 0,  -- Post as a new thread in a Discord Forum channel
  spreadsheet_id TEXT,         -- Google Sheet ID for the "google_sheets" platform
  sheet_name     TEXT,         -- Target tab name; defaults to "Sheet1" when sending
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO notification_channels_new
  (id, country_id, label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to, discord_forum, created_at)
  SELECT id, country_id, label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to, discord_forum, created_at
  FROM notification_channels;

DROP TABLE notification_channels;
ALTER TABLE notification_channels_new RENAME TO notification_channels;

CREATE INDEX IF NOT EXISTS idx_channels_country ON notification_channels(country_id);
