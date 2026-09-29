-- Aggregate counters that survive the 24h request purge (see the `scheduled` handler in
-- src/server-entry.ts): before a batch of requests is deleted, its counts are rolled up here
-- by submitter/country/type so per-user Reports stay accurate without retaining request
-- content (permalinks, notes, screenshots).
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE IF NOT EXISTS request_stats (
  submitted_by TEXT    NOT NULL,
  country_id   INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL CHECK(type IN ('downlock','uplock','imagery','accept_pur','decline_pur')),
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (submitted_by, country_id, type)
);
