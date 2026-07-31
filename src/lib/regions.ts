import { dbAll, dbFirst, dbRun } from './db'
import { json, err } from './http'
import { canAccessCountry, type UserAccess } from './access'

export interface Region {
  id: number
  country_id: number
  name: string
  code: string
  created_at: string
}

// Public (the userscript reads this cross-origin, unauthenticated, to populate its region
// dropdown and to auto-detect the current one) — same treatment as GET /api/countries.
export async function getRegions(countryId: number) {
  const country = await dbFirst('SELECT id FROM countries WHERE id = ?', [countryId])
  if (!country) return err('Country not found', 404)
  const rows = await dbAll<Region>('SELECT * FROM regions WHERE country_id = ? ORDER BY name ASC', [countryId])
  return json(rows)
}

export async function createRegion(access: UserAccess, countryId: number, body: { name?: string; code?: string }) {
  const country = await dbFirst('SELECT id FROM countries WHERE id = ?', [countryId])
  if (!country) return err('Country not found', 404)
  if (!canAccessCountry(access, countryId)) return err('Country not found', 404)
  const { name, code } = body
  if (!name?.trim()) return err('name is required')
  if (!code?.trim()) return err('code is required')
  if (code.trim().length < 1 || code.trim().length > 10) return err('code must be 1–10 characters')
  try {
    const result = await dbRun('INSERT INTO regions (country_id, name, code) VALUES (?, ?, ?)', [
      countryId,
      name.trim(),
      code.trim().toUpperCase(),
    ])
    const row = await dbFirst<Region>('SELECT * FROM regions WHERE id = ?', [result.meta.last_row_id])
    return json(row, 201)
  } catch (e) {
    if ((e as Error).message.includes('UNIQUE')) return err('Region code already exists in this country', 409)
    throw e
  }
}

export async function updateRegion(access: UserAccess, id: number, body: { name?: string; code?: string }) {
  const existing = await dbFirst<Region>('SELECT * FROM regions WHERE id = ?', [id])
  if (!existing) return err('Region not found', 404)
  if (!canAccessCountry(access, existing.country_id)) return err('Region not found', 404)
  const name = body.name?.trim() || existing.name
  const code = body.code?.trim() ? body.code.trim().toUpperCase() : existing.code
  try {
    await dbRun('UPDATE regions SET name = ?, code = ? WHERE id = ?', [name, code, id])
    const row = await dbFirst<Region>('SELECT * FROM regions WHERE id = ?', [id])
    return json(row)
  } catch (e) {
    if ((e as Error).message.includes('UNIQUE')) return err('Region code already exists in this country', 409)
    throw e
  }
}

export async function deleteRegion(access: UserAccess, id: number) {
  const existing = await dbFirst<Region>('SELECT * FROM regions WHERE id = ?', [id])
  if (!existing) return err('Region not found', 404)
  if (!canAccessCountry(access, existing.country_id)) return err('Region not found', 404)
  const result = await dbRun('DELETE FROM regions WHERE id = ?', [id])
  if (!result.meta.changes) return err('Region not found', 404)
  return new Response(null, { status: 204 })
}
