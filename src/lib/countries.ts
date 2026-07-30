import { dbAll, dbFirst, dbRun } from './db'
import { json, err } from './http'

export interface Country {
  id: number
  name: string
  code: string
  created_at: string
}

export async function getCountries() {
  const rows = await dbAll<Country>('SELECT * FROM countries ORDER BY name ASC')
  return json(rows)
}

export async function getCountry(id: number) {
  const row = await dbFirst<Country>('SELECT * FROM countries WHERE id = ?', [id])
  if (!row) return err('Country not found', 404)
  return json(row)
}

export async function createCountry(body: { name?: string; code?: string }) {
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

export async function updateCountry(id: number, body: { name?: string; code?: string }) {
  const existing = await dbFirst<Country>('SELECT * FROM countries WHERE id = ?', [id])
  if (!existing) return err('Country not found', 404)
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

export async function deleteCountry(id: number) {
  const result = await dbRun('DELETE FROM countries WHERE id = ?', [id])
  if (!result.meta.changes) return err('Country not found', 404)
  return new Response(null, { status: 204 })
}
