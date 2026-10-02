-- Sign-in moves to the central WazeTools account service (wmeAuth, auth.wazetools.com), which
-- has this app's users imported with the same ids (wmeAuth's scripts/import-users.mjs).
-- Apply with: wrangler d1 migrations apply wme-requests
--
-- Anyone can now have a WazeTools account, so having one no longer means having access here:
-- access is a row in user_access (no row = no access, see src/lib/access.ts). "user" stays as a
-- local copy of central users, kept by src/lib/central-auth.ts, because user_access,
-- user_countries, push_subscriptions and credentials reference it. Better Auth's other tables
-- and "user".is_global / "user".feed_token are no longer used; a later migration drops them,
-- once this release is live.

CREATE TABLE IF NOT EXISTS user_access (
  user_id    TEXT    NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  -- 1: every country (and user management); 0: only the countries in user_countries.
  is_global  INTEGER NOT NULL DEFAULT 0,
  -- Secret for this user's RSS feed URL (moved from "user".feed_token, see 0021).
  feed_token TEXT    UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Every existing user keeps exactly the access they had.
INSERT OR IGNORE INTO user_access (user_id, is_global, feed_token)
  SELECT id, is_global, feed_token FROM "user";
