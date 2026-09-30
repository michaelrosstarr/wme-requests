-- Per-user secret for the RSS feed (GET /api/feed?token=...). Feed readers can't send a session
-- cookie, so the token stands in for the user and scopes the feed to their assigned countries.
-- Rotating it (POST /api/feed-token) revokes any previously shared feed URLs.
-- Apply with: wrangler d1 migrations apply wme-requests

ALTER TABLE "user" ADD COLUMN feed_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_feed_token ON "user"(feed_token);
