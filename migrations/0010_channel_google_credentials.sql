-- Per-channel Google service account credentials for the "google_sheets" platform,
-- encrypted at rest (see src/lib/crypto.ts) — different channels may use different
-- Google accounts/spreadsheets, so this replaces a single shared server-wide secret.
-- Apply with: wrangler d1 migrations apply wme-requests

ALTER TABLE notification_channels ADD COLUMN google_credentials_encrypted TEXT;
