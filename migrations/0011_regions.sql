-- States/provinces within a country (e.g. the US's 50 states). Optional, finer-grained
-- scope for notification channels and requests underneath the existing country level.
-- A request/channel with no matching region falls back to the country's own channels —
-- see fireNotifications in src/lib/notifications.ts.
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE IF NOT EXISTS regions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  code       TEXT    NOT NULL COLLATE NOCASE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (country_id, code)
);

CREATE INDEX IF NOT EXISTS idx_regions_country ON regions(country_id);

-- NULL region_id means "country-wide" — the existing behaviour. A channel scoped to a
-- region only fires for requests in that region; requests in a region with no channels
-- of a given event_type fall back to that region's country-wide (region_id IS NULL) channels.
ALTER TABLE notification_channels ADD COLUMN region_id INTEGER REFERENCES regions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_channels_region ON notification_channels(region_id);

-- NULL region_id means the submitter's region couldn't be detected/selected; the request
-- is still fully valid at the country level. ON DELETE SET NULL (not CASCADE, unlike
-- country_id) so deleting a region doesn't destroy request history, only detaches it.
ALTER TABLE requests ADD COLUMN region_id INTEGER REFERENCES regions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_requests_region ON requests(region_id);
