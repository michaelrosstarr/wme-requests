#!/usr/bin/env node
// One-off helper: prints SQL to create the first (or an additional) admin user.
// Sign-up is disabled at the API level (see src/lib/auth.ts), so accounts are
// provisioned directly in D1 instead.
//
// Usage:
//   node scripts/create-admin-user.mjs you@example.com 'your-password' "Your Name"
//
// Then run the printed SQL against your database:
//   wrangler d1 execute wme-requests --local  --command "$(node scripts/create-admin-user.mjs ...)"
//   wrangler d1 execute wme-requests --remote --command "$(node scripts/create-admin-user.mjs ...)"

import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'

const [, , email, password, name] = process.argv

if (!email || !password) {
  console.error('Usage: node scripts/create-admin-user.mjs <email> <password> [name]')
  process.exit(1)
}

const userId = randomUUID()
const accountId = randomUUID()
const hash = await hashPassword(password)
const now = new Date().toISOString()
const displayName = (name || email).replace(/'/g, "''")
const safeEmail = email.replace(/'/g, "''")

console.log(
  [
    `INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt") VALUES ('${userId}','${displayName}','${safeEmail}',1,'${now}','${now}');`,
    `INSERT INTO "account" ("id","accountId","providerId","userId","password","createdAt","updatedAt") VALUES ('${accountId}','${userId}','credential','${userId}','${hash}','${now}','${now}');`,
  ].join(' '),
)
