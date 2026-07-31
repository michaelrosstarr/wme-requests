-- Channels reference reusable credentials instead of embedding their own encrypted blob.
-- Apply with: wrangler d1 migrations apply wme-requests

ALTER TABLE notification_channels ADD COLUMN google_credential_id INTEGER REFERENCES credentials(id);
ALTER TABLE notification_channels ADD COLUMN email_credential_id INTEGER REFERENCES credentials(id);

-- Backfill: turn each channel's existing embedded Google credential into a standalone,
-- shared credentials row, then point the channel at it. The ciphertext is copied as-is
-- (same CHANNEL_CREDENTIALS_KEY) — no decrypt/re-encrypt needed.
INSERT INTO credentials (type, owner_user_id, label, secret_encrypted)
SELECT 'google_service_account', NULL, 'Migrated — ' || label, google_credentials_encrypted
FROM notification_channels
WHERE google_credentials_encrypted IS NOT NULL;

UPDATE notification_channels
SET google_credential_id = (
  SELECT c.id FROM credentials c
  WHERE c.secret_encrypted = notification_channels.google_credentials_encrypted
  LIMIT 1
)
WHERE google_credentials_encrypted IS NOT NULL;

ALTER TABLE notification_channels DROP COLUMN google_credentials_encrypted;
