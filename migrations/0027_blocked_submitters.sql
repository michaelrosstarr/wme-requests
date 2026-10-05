-- Blocked submitters: Waze usernames that may no longer submit requests (POST /api/requests
-- rejects them, see src/lib/blocks.ts). Managed by global users from Admin → Blocked Submitters
-- or the Reports page. Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE IF NOT EXISTS blocked_submitters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Matched case-insensitively against requests.submitted_by.
  username   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  reason     TEXT,
  blocked_by TEXT    REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
