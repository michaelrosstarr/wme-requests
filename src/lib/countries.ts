import { dbAll, dbFirst, dbRun } from './db'
import { json, err } from './http'
import { getAuth } from './auth'
import { canAccessCountry, getUserAccess, type UserAccess } from './access'

export interface Country {
  id: number
  name: string
  code: string
  created_at: string
}

// Public (the userscript reads this cross-origin, unauthenticated, to populate its country
// dropdown) but scoped down to the caller's assigned countries when a dashboard session is
// present — best-effort session lookup here rather than apiRoute's built-in check, since this
// one endpoint needs to behave differently for each kind of caller.
export async function getCountries(request: Request) {
  const rows = await dbAll<Country>('SELECT * FROM countries ORDER BY name ASC')
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (!session) return json(rows)
  const access = await getUserAccess(session.user.id)
  return json(access.isGlobal ? rows : rows.filter((c) => access.countryIds.includes(c.id)))
}

export async function getCountry(id: number) {
  const row = await dbFirst<Country>('SELECT * FROM countries WHERE id = ?', [id])
  if (!row) return err('Country not found', 404)
  return json(row)
}

export async function createCountry(access: UserAccess, body: { name?: string; code?: string }) {
  if (!access.isGlobal) return err('Only global users can add countries', 403)
  const { name, code } = body
  if (!name?.trim()) return err('name is required')
  if (!code?.trim()) return err('code is required')
  if (code.trim().length < 2 || code.trim().length > 10) return err('code must be 2–10 characters')
  try {
    const result = await dbRun('INSERT INTO countries (name, code) VALUES (?, ?)', [
      name.trim(),
      code.trim().toUpperCase(),
    ])
    const row = await dbFirst<Country>('SELECT * FROM countries WHERE id = ?', [result.meta.last_row_id])
    return json(row, 201)
  } catch (e) {
    if ((e as Error).message.includes('UNIQUE')) return err('Country code already exists', 409)
    throw e
  }
}

export async function updateCountry(
  access: UserAccess,
  id: number,
  body: { name?: string; code?: string },
) {
  const existing = await dbFirst<Country>('SELECT * FROM countries WHERE id = ?', [id])
  if (!existing) return err('Country not found', 404)
  if (!canAccessCountry(access, id)) return err('Country not found', 404)
  const name = body.name?.trim() || existing.name
  const code = body.code?.trim() ? body.code.trim().toUpperCase() : existing.code
  try {
    await dbRun('UPDATE countries SET name = ?, code = ? WHERE id = ?', [name, code, id])
    const row = await dbFirst<Country>('SELECT * FROM countries WHERE id = ?', [id])
    return json(row)
  } catch (e) {
    if ((e as Error).message.includes('UNIQUE')) return err('Country code already exists', 409)
    throw e
  }
}

export async function deleteCountry(access: UserAccess, id: number) {
  if (!canAccessCountry(access, id)) return err('Country not found', 404)
  const result = await dbRun('DELETE FROM countries WHERE id = ?', [id])
  if (!result.meta.changes) return err('Country not found', 404)
  return new Response(null, { status: 204 })
}
