-- Per-user account security log (sign-ins, failed sign-ins, and changes to sign-in methods /
-- two-factor settings). Written by src/lib/security-activity.ts, shown on the Account page.
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE IF NOT EXISTS security_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  event      TEXT    NOT NULL,
  detail     TEXT,
  ip         TEXT,
  country    TEXT,
  user_agent TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS security_events_user_id_idx ON security_events (user_id, id);
