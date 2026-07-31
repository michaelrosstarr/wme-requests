-- Discord channels can optionally post as a new thread in a Discord Forum channel.
-- Apply with: wrangler d1 migrations apply wme-requests

ALTER TABLE notification_channels ADD COLUMN discord_forum INTEGER NOT NULL DEFAULT 0;
