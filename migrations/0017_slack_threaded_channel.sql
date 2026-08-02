-- Adds "slack_threaded" as a notification channel platform — an alternative to the plain
-- "slack" incoming-webhook platform that threads consecutive requests from the same submitter
-- (same calendar UTC day) into one Slack thread instead of posting a new top-level message
-- each time. This requires Slack's chat.postMessage Web API (to get back a message `ts` to
-- thread against), not an incoming webhook, so it reuses bot_token/chat_id the same way
-- Telegram does: bot_token holds the Slack bot token (xoxb-...), chat_id holds the Slack
-- channel ID. webhook_url-based "slack" channels are untouched and keep working exactly as
-- before. SQLite can't ALTER a CHECK constraint or add columns with certain defaults in one
-- step alongside it, so the table is recreated, same as 0005/0008/0014/0016.
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE notification_channels_new (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id             INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  region_id              INTEGER REFERENCES regions(id) ON DELETE CASCADE,
  label                  TEXT    NOT NULL,
  platform               TEXT    NOT NULL CHECK(platform IN ('slack','slack_threaded','discord','telegram','email','webhook','google_sheets','google_chat','ntfy','gotify')),
  event_type             TEXT    NOT NULL CHECK(event_type IN ('global','downlock','imagery')),
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
  -- Threading state for slack_threaded — who/when/what-ts the last message in this channel
  -- was, so the next request can decide whether to reply in-thread or start a new one.
  last_thread_submitted_by TEXT,
  last_thread_ts            TEXT,
  last_thread_day           TEXT,
  created_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
