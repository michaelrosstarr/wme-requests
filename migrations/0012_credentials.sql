-- Reusable, encrypted credential store — a shared pool for Google service accounts
-- (multiple accounts, reusable across any google_sheets channel) and BYOK email provider
-- credentials (Postmark/Mailgun/SMTP), each owned by the user who added it.
-- Apply with: wrangler d1 migrations apply wme-requests

CREATE TABLE IF NOT EXISTS credentials (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  type               TEXT    NOT NULL CHECK(type IN ('google_service_account','email_postmark','email_mailgun','email_smtp')),
  -- NULL only for the shared Google service-account pool. Required for every email_* type —
  -- BYOK email credentials belong to the user who added them, not the instance.
  owner_user_id      TEXT    REFERENCES "user"(id) ON DELETE CASCADE,
  label              TEXT    NOT NULL,
  -- Non-secret identifier shown in list views without decrypting (client_email for Google,
  -- the sending From address for email providers).
  display_identifier TEXT,
  -- AES-GCM ciphertext via src/lib/crypto.ts — a JSON payload whose shape depends on `type`.
  secret_encrypted   TEXT    NOT NULL,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_credentials_owner ON credentials(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_type  ON credentials(type);
