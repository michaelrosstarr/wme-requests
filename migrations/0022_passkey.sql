-- Passkey (WebAuthn) credentials for the @better-auth/passkey plugin
-- Apply with: wrangler d1 migrations apply wme-requests
-- Columns mirror the schema exported by @better-auth/passkey (see src/lib/auth.ts), in the
-- same style as 0002_better_auth.sql.

CREATE TABLE IF NOT EXISTS "passkey" (
  "id"           TEXT    NOT NULL PRIMARY KEY,
  "name"         TEXT,
  "publicKey"    TEXT    NOT NULL,
  "userId"       TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "credentialID" TEXT    NOT NULL,
  "counter"      INTEGER NOT NULL,
  "deviceType"   TEXT    NOT NULL,
  "backedUp"     INTEGER NOT NULL,
  "transports"   TEXT,
  "createdAt"    DATE,
  "aaguid"       TEXT
);

CREATE INDEX IF NOT EXISTS "passkey_userId_idx" ON "passkey" ("userId");
CREATE INDEX IF NOT EXISTS "passkey_credentialID_idx" ON "passkey" ("credentialID");
