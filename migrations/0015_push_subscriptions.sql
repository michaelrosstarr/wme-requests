-- Self-service Web Push subscriptions: a signed-in user can subscribe their own browser to
-- a country (optionally scoped further to one region) and get a native notification when a
-- matching request comes in, independent of the admin-configured notification_channels.
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  -- NULL means country-wide; set means this subscription only fires for that region's
  -- requests, same fallback semantics as notification_channels.region_id.
  region_id  INTEGER REFERENCES regions(id) ON DELETE CASCADE,
  event_type TEXT    NOT NULL DEFAULT 'global' CHECK(event_type IN ('global', 'downlock', 'imagery')),
  endpoint   TEXT    NOT NULL,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user  ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_scope ON push_subscriptions(country_id, region_id);
