import { dbAll, dbFirst, dbRun } from './db'
import { json, err } from './http'
import type { UserAccess } from './access'

// Waze usernames blocked from submitting requests. The username is whatever the userscript
// reports as submitted_by — the submit endpoint is public, so this stops an editor using the
// script normally, not someone determined to forge requests.

export interface BlockedSubmitterRow {
  id: number
  username: string
  reason: string | null
  blocked_by: string | null
  blocked_by_name: string | null
  created_at: string
}

const SELECT_BLOCKS = `SELECT b.id, b.username, b.reason, b.blocked_by, u.name AS blocked_by_name, b.created_at
  FROM blocked_submitters b LEFT JOIN "user" u ON u.id = b.blocked_by`

// Like user management, blocking applies to every country, so it's global-only.
function requireGlobal(access: UserAccess) {
  return access.isGlobal ? null : err('Only global users can block submitters', 403)
}

export async function isSubmitterBlocked(username: string | null | undefined) {
  const name = username?.trim()
  if (!name) return false
  return !!(await dbFirst(`SELECT 1 FROM blocked_submitters WHERE username = ?`, [name]))
}

export async function listBlockedSubmitters(access: UserAccess) {
  const denied = requireGlobal(access)
  if (denied) return denied
  return json(await dbAll<BlockedSubmitterRow>(`${SELECT_BLOCKS} ORDER BY b.created_at DESC`))
}

export async function blockSubmitter(access: UserAccess, body: { username?: string; reason?: string | null }) {
  const denied = requireGlobal(access)
  if (denied) return denied
  const username = body.username?.trim()
  if (!username) return err('username is required')
  if (await isSubmitterBlocked(username)) return err(`${username} is already blocked`, 409)
  const result = await dbRun(`INSERT INTO blocked_submitters (username, reason, blocked_by) VALUES (?, ?, ?)`, [
    username,
    body.reason?.trim() || null,
    access.userId,
  ])
  return json(await dbFirst<BlockedSubmitterRow>(`${SELECT_BLOCKS} WHERE b.id = ?`, [result.meta.last_row_id]), 201)
}

export async function unblockSubmitter(access: UserAccess, id: number) {
  const denied = requireGlobal(access)
  if (denied) return denied
  const result = await dbRun(`DELETE FROM blocked_submitters WHERE id = ?`, [id])
  if (!result.meta.changes) return err('Block not found', 404)
  return new Response(null, { status: 204 })
}
