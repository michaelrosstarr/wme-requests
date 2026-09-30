-- Two-factor authentication: Better Auth's twoFactor plugin (email codes, authenticator app,
-- backup codes) plus the security-key second factor in src/lib/security-key-2fa.ts.
-- Apply with: wrangler d1 migrations apply wme-requests
-- Columns mirror the schema exported by better-auth/plugins/two-factor (1.6.x) and the
-- `securityKey` schema in src/lib/security-key-2fa.ts, in the same style as 0002/0022.

ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS "twoFactor" (
  "id"                      TEXT    NOT NULL PRIMARY KEY,
  "secret"                  TEXT    NOT NULL,
  "backupCodes"             TEXT    NOT NULL,
  "userId"                  TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "verified"                INTEGER DEFAULT 1,
  "failedVerificationCount" INTEGER DEFAULT 0,
  "lockedUntil"             DATE
);

CREATE INDEX IF NOT EXISTS "twoFactor_secret_idx" ON "twoFactor" ("secret");
CREATE INDEX IF NOT EXISTS "twoFactor_userId_idx" ON "twoFactor" ("userId");

CREATE TABLE IF NOT EXISTS "securityKey" (
  "id"           TEXT    NOT NULL PRIMARY KEY,
  "name"         TEXT,
  "publicKey"    TEXT    NOT NULL,
  "userId"       TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "credentialID" TEXT    NOT NULL,
  "counter"      INTEGER NOT NULL,
  "transports"   TEXT,
  "createdAt"    DATE    NOT NULL
);

CREATE INDEX IF NOT EXISTS "securityKey_userId_idx" ON "securityKey" ("userId");
CREATE INDEX IF NOT EXISTS "securityKey_credentialID_idx" ON "securityKey" ("credentialID");
