import { hashPassword } from 'better-auth/crypto'
import { dbAll, dbFirst, dbRun, isEmail } from './db'
import { json, err } from './http'
import { getAuth } from './auth'
import type { UserAccess } from './access'

export interface AdminUserRow {
  id: string
  name: string
  email: string
  emailVerified: number
  createdAt: string
  hasPassword: number
  isGlobal: number
  countryIds: number[]
}

// User management is itself a global-only capability — a country-scoped editor shouldn't be
// able to create accounts or grant other users (including themselves) broader access.
function requireGlobal(access: UserAccess) {
  return access.isGlobal ? null : err('Only global users can manage users', 403)
}

async function attachCountryIds(rows: Omit<AdminUserRow, 'countryIds'>[]): Promise<AdminUserRow[]> {
  if (!rows.length) return []
  const links = await dbAll<{ user_id: string; country_id: number }>(
    `SELECT user_id, country_id FROM user_countries WHERE user_id IN (${rows.map(() => '?').join(',')})`,
    rows.map((r) => r.id),
  )
  const byUser = new Map<string, number[]>()
  for (const link of links) byUser.set(link.user_id, [...(byUser.get(link.user_id) ?? []), link.country_id])
  return rows.map((r) => ({ ...r, countryIds: byUser.get(r.id) ?? [] }))
}

export async function listUsers(access: UserAccess) {
  const denied = requireGlobal(access)
  if (denied) return denied
  const rows = await dbAll<Omit<AdminUserRow, 'countryIds'>>(
    `SELECT u.id, u.name, u.email, u.emailVerified, u.createdAt, u.is_global AS isGlobal,
            CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS hasPassword
     FROM "user" u
     LEFT JOIN "account" a ON a.userId = u.id AND a.providerId = 'credential'
     ORDER BY u.createdAt DESC`,
  )
  return json(await attachCountryIds(rows))
}

async function findByEmail(email: string) {
  return dbFirst<{ id: string }>(`SELECT id FROM "user" WHERE email = ?`, [email])
}

async function getRow(id: string) {
  const row = await dbFirst<Omit<AdminUserRow, 'countryIds'>>(
    `SELECT u.id, u.name, u.email, u.emailVerified, u.createdAt, u.is_global AS isGlobal,
            CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS hasPassword
     FROM "user" u
     LEFT JOIN "account" a ON a.userId = u.id AND a.providerId = 'credential'
     WHERE u.id = ?`,
    [id],
  )
  if (!row) return null
  return (await attachCountryIds([row]))[0]
}

interface AccessBody {
  isGlobal?: boolean
  countryIds?: number[]
}

// Returns an error Response if the access selection is invalid, else the normalized values.
function resolveAccess(body: AccessBody): { error: Response } | { isGlobal: boolean; countryIds: number[] } {
  const isGlobal = body.isGlobal !== false
  const countryIds = Array.isArray(body.countryIds) ? body.countryIds.map(Number).filter(Number.isInteger) : []
  if (!isGlobal && !countryIds.length) {
    return { error: err('Select at least one country, or grant global access') }
  }
  return { isGlobal, countryIds }
}

async function setUserCountries(userId: string, isGlobal: boolean, countryIds: number[]) {
  await dbRun(`UPDATE "user" SET is_global = ? WHERE id = ?`, [isGlobal ? 1 : 0, userId])
  await dbRun(`DELETE FROM user_countries WHERE user_id = ?`, [userId])
  for (const countryId of countryIds) {
    await dbRun(`INSERT INTO user_countries (user_id, country_id) VALUES (?, ?)`, [userId, countryId])
  }
}

export async function createUser(
  access: UserAccess,
  body: { name?: string; email?: string; password?: string } & AccessBody,
) {
  const denied = requireGlobal(access)
  if (denied) return denied
  const { name, password } = body
  const email = body.email?.trim().toLowerCase()
  if (!email || !isEmail(email)) return err('A valid email is required')
  if (!password || password.length < 8) return err('Password must be at least 8 characters')
  if (await findByEmail(email)) return err('A user with that email already exists', 409)
  const resolved = resolveAccess(body)
  if ('error' in resolved) return resolved.error

  const userId = crypto.randomUUID()
  const now = new Date().toISOString()
  const hash = await hashPassword(password)
  await dbRun(
    `INSERT INTO "user" ("id","name","email","emailVerified","is_global","createdAt","updatedAt") VALUES (?,?,?,1,?,?,?)`,
    [userId, name?.trim() || email, email, resolved.isGlobal ? 1 : 0, now, now],
  )
  await dbRun(
    `INSERT INTO "account" ("id","accountId","providerId","userId","password","createdAt","updatedAt") VALUES (?,?,'credential',?,?,?,?)`,
    [crypto.randomUUID(), userId, userId, hash, now, now],
  )
  for (const countryId of resolved.countryIds) {
    await dbRun(`INSERT INTO user_countries (user_id, country_id) VALUES (?, ?)`, [userId, countryId])
  }
  return json(await getRow(userId), 201)
}

export async function inviteUser(access: UserAccess, body: { name?: string; email?: string } & AccessBody) {
  const denied = requireGlobal(access)
  if (denied) return denied
  const { name } = body
  const email = body.email?.trim().toLowerCase()
  if (!email || !isEmail(email)) return err('A valid email is required')
  if (await findByEmail(email)) return err('A user with that email already exists', 409)
  const resolved = resolveAccess(body)
  if ('error' in resolved) return resolved.error

  const userId = crypto.randomUUID()
  const now = new Date().toISOString()
  // No account row yet — the invite email's reset-password link creates one once
  // they set a password (see sendResetPassword in src/lib/auth.ts).
  await dbRun(
    `INSERT INTO "user" ("id","name","email","emailVerified","is_global","createdAt","updatedAt") VALUES (?,?,?,0,?,?,?)`,
    [userId, name?.trim() || email, email, resolved.isGlobal ? 1 : 0, now, now],
  )
  for (const countryId of resolved.countryIds) {
    await dbRun(`INSERT INTO user_countries (user_id, country_id) VALUES (?, ?)`, [userId, countryId])
  }
  await getAuth().api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } })
  return json(await getRow(userId), 201)
}

export async function resetUserPassword(access: UserAccess, id: string) {
  const denied = requireGlobal(access)
  if (denied) return denied
  const user = await dbFirst<{ email: string }>(`SELECT email FROM "user" WHERE id = ?`, [id])
  if (!user) return err('User not found', 404)
  await getAuth().api.requestPasswordReset({ body: { email: user.email, redirectTo: '/reset-password' } })
  return json({ status: true })
}

export async function updateUserAccess(access: UserAccess, id: string, body: AccessBody) {
  const denied = requireGlobal(access)
  if (denied) return denied
  const existing = await dbFirst<{ id: string }>(`SELECT id FROM "user" WHERE id = ?`, [id])
  if (!existing) return err('User not found', 404)
  const resolved = resolveAccess(body)
  if ('error' in resolved) return resolved.error
  await setUserCountries(id, resolved.isGlobal, resolved.countryIds)
  return json(await getRow(id))
}
