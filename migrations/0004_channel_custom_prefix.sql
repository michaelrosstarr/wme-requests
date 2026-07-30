-- Optional custom text a notification channel prepends to every message it sends,
-- before the permalink line (e.g. a community tag like "L5ZA").
-- Apply with: wrangler d1 migrations apply wme-requests

ALTER TABLE notification_channels ADD COLUMN custom_prefix TEXT;
