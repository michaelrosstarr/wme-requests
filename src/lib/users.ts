import { env } from 'cloudflare:workers'
import { dbAll, dbFirst, getDb, isEmail } from './db'
import { json, err } from './http'
import { authService, ensureLocalUser, type AccountUser } from './central-auth'
import type { UserAccess } from './access'

// Accounts live in the WMEKit account service (wmeAuth); this app only decides who gets in
// and what they can see. "Users" here are the accounts with a user_access row. Names, emails and
// account status come from wmeAuth over the AUTH binding.

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
// able to add users or grant other users (including themselves) broader access.
function requireGlobal(access: UserAccess) {
  return access.isGlobal ? null : err('Only global users can manage users', 403)
}

/** wmeAuth RPC errors arrive as "<status>: <message>"; turn them back into a JSON error. */
function rpcError(e: unknown) {
  const m = /^(\d{3}): (.*)$/s.exec(e instanceof Error ? e.message : String(e))
  if (m) return err(m[2], Number(m[1]))
  throw e
}

interface AccessRow {
  id: string
  name: string
  email: string
  createdAt: string
  isGlobal: number
}

const SELECT_ACCESS = `SELECT ua.user_id AS id, u.name, u.email, ua.created_at AS createdAt, ua.is_global AS isGlobal
  FROM user_access ua JOIN "user" u ON u.id = ua.user_id`

async function toAdminRows(rows: AccessRow[]): Promise<AdminUserRow[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const links = await dbAll<{ user_id: string; country_id: number }>(
    `SELECT user_id, country_id FROM user_countries WHERE user_id IN (${ids.map(() => '?').join(',')})`,
    ids,
  )
  const byUser = new Map<string, number[]>()
  for (const link of links) byUser.set(link.user_id, [...(byUser.get(link.user_id) ?? []), link.country_id])
  // Fresh name/email/status from the account service; the local copy is only a fallback.
  const central = new Map<string, AccountUser>()
  try {
    for (const u of await authService().getUsers(ids)) central.set(u.id, u)
  } catch (e) {
    console.error('getUsers over AUTH binding failed', e)
  }
  return rows.map((r) => {
    const c = central.get(r.id)
    return {
      id: r.id,
      name: c?.name ?? r.name,
      email: c?.email ?? r.email,
      emailVerified: c?.emailVerified ? 1 : 0,
      createdAt: r.createdAt,
      hasPassword: c ? (c.hasPassword ? 1 : 0) : 1,
      isGlobal: r.isGlobal,
      countryIds: byUser.get(r.id) ?? [],
    }
  })
}

export async function listUsers(access: UserAccess) {
  const denied = requireGlobal(access)
  if (denied) return denied
  return json(await toAdminRows(await dbAll<AccessRow>(`${SELECT_ACCESS} ORDER BY ua.created_at DESC`)))
}

async function getRow(id: string) {
  const row = await dbFirst<AccessRow>(`${SELECT_ACCESS} WHERE ua.user_id = ?`, [id])
  return row ? (await toAdminRows([row]))[0] : null
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

async function writeAccess(userId: string, isGlobal: boolean, countryIds: number[]) {
  const db = getDb()
  await db.batch([
    db
      .prepare(
        `INSERT INTO user_access (user_id, is_global) VALUES (?, ?)
         ON CONFLICT (user_id) DO UPDATE SET is_global = excluded.is_global`,
      )
      .bind(userId, isGlobal ? 1 : 0),
    db.prepare(`DELETE FROM user_countries WHERE user_id = ?`).bind(userId),
    ...countryIds.map((countryId) =>
      db.prepare(`INSERT INTO user_countries (user_id, country_id) VALUES (?, ?)`).bind(userId, countryId),
    ),
  ])
}

/**
 * Gives someone access by email. The account service finds their WMEKit account or creates
 * one and emails them a link to set a password, which then brings them back here.
 */
export async function inviteUser(access: UserAccess, body: { name?: string; email?: string } & AccessBody) {
  const denied = requireGlobal(access)
  if (denied) return denied
  const email = body.email?.trim().toLowerCase()
  if (!email || !isEmail(email)) return err('A valid email is required')
  const resolved = resolveAccess(body)
  if ('error' in resolved) return resolved.error

  let user: AccountUser
  try {
    ;({ user } = await authService().inviteUser({
      email,
      name: body.name?.trim() || undefined,
      redirect: new URL('/requests', env.APP_URL).href,
    }))
  } catch (e) {
    return rpcError(e)
  }
  if (await dbFirst(`SELECT 1 FROM user_access WHERE user_id = ?`, [user.id])) {
    return err('That user already has access', 409)
  }
  await ensureLocalUser(user)
  await writeAccess(user.id, resolved.isGlobal, resolved.countryIds)
  return json(await getRow(user.id), 201)
}

export async function resetUserPassword(access: UserAccess, id: string) {
  const denied = requireGlobal(access)
  if (denied) return denied
  if (!(await dbFirst(`SELECT 1 FROM user_access WHERE user_id = ?`, [id]))) return err('User not found', 404)
  try {
    await authService().sendPasswordEmail({ userId: id, redirect: new URL('/requests', env.APP_URL).href })
  } catch (e) {
    return rpcError(e)
  }
  return json({ status: true })
}

export async function updateUserAccess(access: UserAccess, id: string, body: AccessBody) {
  const denied = requireGlobal(access)
  if (denied) return denied
  if (!(await dbFirst(`SELECT 1 FROM user_access WHERE user_id = ?`, [id]))) return err('User not found', 404)
  const resolved = resolveAccess(body)
  if ('error' in resolved) return resolved.error
  await writeAccess(id, resolved.isGlobal, resolved.countryIds)
  return json(await getRow(id))
}

/** Takes away someone's access (their WMEKit account itself is untouched). */
export async function removeUserAccess(access: UserAccess, id: string) {
  const denied = requireGlobal(access)
  if (denied) return denied
  if (id === access.userId) return err("You can't remove your own access", 400)
  const db = getDb()
  const [, res] = await db.batch([
    db.prepare(`DELETE FROM user_countries WHERE user_id = ?`).bind(id),
    db.prepare(`DELETE FROM user_access WHERE user_id = ?`).bind(id),
    db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ?`).bind(id),
  ])
  if (!res.meta.changes) return err('User not found', 404)
  return new Response(null, { status: 204 })
}
