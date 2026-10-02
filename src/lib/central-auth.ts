import { env } from 'cloudflare:workers'
import { dbFirst, getDb } from './db'

const nowIso = () => new Date().toISOString()

// Sign-in lives in the central WazeTools account service (wmeAuth, auth.wazetools.com). Its
// session cookie is scoped to .wazetools.com, so the browser sends it here too; we never parse
// it ourselves, we hand it to wmeAuth over the AUTH service binding (worker-to-worker, no
// public hop). wmeAuth owns identity; this app owns authorization (`user_access`,
// `user_countries`, see src/lib/access.ts) and data.

export interface CentralUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
}

/** A user as wmeAuth's RPC methods return it (see AccountUser in its src/lib/users.ts). */
export interface AccountUser {
  id: string
  name: string
  email: string
  image: string | null
  emailVerified: boolean
  hasPassword: boolean
  disabled: boolean
  createdAt: string
}

/** wmeAuth's RPC methods (see its src/server-entry.ts). Errors arrive as "<status>: <message>". */
interface AuthService {
  getUsers(ids: string[]): Promise<AccountUser[]>
  inviteUser(input: { email: string; name?: string; redirect?: string }): Promise<{
    user: AccountUser
    created: boolean
    emailSent: boolean
  }>
  sendPasswordEmail(input: { userId: string; redirect?: string }): Promise<void>
}

export function authService() {
  return env.AUTH as unknown as Fetcher & AuthService
}

/** Where the account pages live, e.g. https://auth.wazetools.com. */
export function authUrl(path = '/') {
  return new URL(path, env.AUTH_URL).href
}

/**
 * The signed-in user for these request headers, or null. `setCookies` are refreshed session
 * cookies from wmeAuth (they're domain-wide, so this app may set them) that the caller must
 * pass on to the browser, or sessions would expire despite the user being active here.
 */
export async function getCentralSession(headers: Headers): Promise<{ user: CentralUser | null; setCookies: string[] }> {
  const cookie = headers.get('cookie')
  if (!cookie?.includes('wazetools.session_')) return { user: null, setCookies: [] }
  // The binding routes straight to the wmeauth Worker whatever the URL's host; using its real
  // URL just keeps Better Auth (and Vite's host check in dev) happy.
  const res = await authService().fetch(authUrl('/api/auth/get-session'), { headers: { cookie } })
  const setCookies = res.headers.getSetCookie()
  if (!res.ok) {
    console.error(`get-session over AUTH binding failed: ${res.status}`)
    return { user: null, setCookies }
  }
  const data = (await res.json()) as { user: CentralUser } | null
  if (!data?.user) return { user: null, setCookies }
  await ensureLocalUser(data.user)
  return { user: data.user, setCookies }
}

/**
 * Keeps a local `"user"` row per central user: our tables (user_access, user_countries,
 * push_subscriptions, credentials) have foreign keys to it. Writes only when the row is new or the name/email changed.
 */
export async function ensureLocalUser(user: Pick<CentralUser, 'id' | 'name' | 'email' | 'emailVerified'>) {
  const upsert = getDb()
    .prepare(
      `INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt") VALUES (?,?,?,1,?,?)
       ON CONFLICT ("id") DO UPDATE SET "name" = excluded."name", "email" = excluded."email", "updatedAt" = excluded."updatedAt"
       WHERE "name" IS NOT excluded."name" OR "email" IS NOT excluded."email"`,
    )
    .bind(user.id, user.name, user.email.toLowerCase(), nowIso(), nowIso())
  try {
    await upsert.run()
  } catch (e) {
    if (!String(e).includes('UNIQUE')) throw e
    await claimLegacyUser(user)
    await upsert.run()
  }
}

/**
 * Another local row already has this email. Users were imported into wmeAuth with their ids, so
 * this only happens if an email already existed there at import time (or changed since). If
 * wmeAuth has verified the address, the person signing in owns it, so the old row's access,
 * push subscriptions and credentials move to them and the old row is deleted. Otherwise the old
 * row just releases the email.
 */
async function claimLegacyUser(user: Pick<CentralUser, 'id' | 'name' | 'email' | 'emailVerified'>) {
  const email = user.email.toLowerCase()
  const old = await dbFirst<{ id: string }>(`SELECT id FROM "user" WHERE email = ? AND id != ?`, [email, user.id])
  if (!old) return
  const db = getDb()
  if (!user.emailVerified) {
    await db.prepare(`UPDATE "user" SET email = ? WHERE id = ?`).bind(`${old.id}@released.invalid`, old.id).run()
    return
  }
  const now = nowIso()
  await db.batch([
    db.prepare(`UPDATE "user" SET email = ? WHERE id = ?`).bind(`${old.id}@released.invalid`, old.id),
    db
      .prepare(
        `INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt") VALUES (?,?,?,1,?,?)
         ON CONFLICT ("id") DO UPDATE SET "name" = excluded."name", "email" = excluded."email", "updatedAt" = excluded."updatedAt"`,
      )
      .bind(user.id, user.name, email, now, now),
    // OR IGNORE: if the new account already has its own access, that wins and the old rows go
    // with the old user below.
    db.prepare(`UPDATE OR IGNORE user_access SET user_id = ? WHERE user_id = ?`).bind(user.id, old.id),
    db.prepare(`UPDATE OR IGNORE user_countries SET user_id = ? WHERE user_id = ?`).bind(user.id, old.id),
    db.prepare(`UPDATE push_subscriptions SET user_id = ? WHERE user_id = ?`).bind(user.id, old.id),
    db.prepare(`UPDATE credentials SET owner_user_id = ? WHERE owner_user_id = ?`).bind(user.id, old.id),
    db.prepare(`DELETE FROM "user" WHERE id = ?`).bind(old.id),
  ])
  console.log(JSON.stringify({ legacy_user_claimed: old.id, user_id: user.id }))
}
