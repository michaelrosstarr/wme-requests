-- Optional viewport screenshot captured by the userscript at submission time,
-- stored in R2 (see the SCREENSHOTS binding) under this key.
-- Apply with: wrangler d1 migrations apply wme-requests

ALTER TABLE requests ADD COLUMN screenshot_key TEXT;
