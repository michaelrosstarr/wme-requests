-- Add the submitting Wazer's current WME editor rank to requests
-- Apply with: wrangler d1 migrations apply wme-requests

ALTER TABLE requests ADD COLUMN editor_rank INTEGER;
