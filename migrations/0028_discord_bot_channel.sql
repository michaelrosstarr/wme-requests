-- Adds the "discord_bot" notification platform: posts through this app's own Discord bot
-- (REST API + bot token, see src/lib/discord-bot.ts) instead of a pasted-in webhook URL.
-- `discord_guilds` records which Discord servers each country has added the bot to via the
-- OAuth2 install flow (src/routes/api/discord/callback.ts) — the guild id there comes from
-- Discord, not the user, so a channel can only be picked from a server linked to its country.
-- SQLite can't ALTER a CHECK constraint in place, so notification_channels is recreated, same
-- recipe as 0019.
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE IF NOT EXISTS discord_guilds (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  guild_id   TEXT    NOT NULL,
  guild_name TEXT    NOT NULL,
  added_by   TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(country_id, guild_id)
);

CREATE TABLE notification_channels_new (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id             INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  region_id              INTEGER REFERENCES regions(id) ON DELETE CASCADE,
  label                  TEXT    NOT NULL,
  platform               TEXT    NOT NULL CHECK(platform IN ('slack','slack_threaded','discord','discord_bot','telegram','email','webhook','google_sheets','google_chat','ntfy','gotify')),
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
  -- discord_bot only: the server (must be in discord_guilds for this country) and the
  -- text/announcement/forum channel in it the bot posts to.
  discord_guild_id       TEXT,
  discord_channel_id     TEXT,
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
