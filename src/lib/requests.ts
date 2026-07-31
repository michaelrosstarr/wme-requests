import { waitUntil } from 'cloudflare:workers'
import { dbAll, dbFirst, dbRun, REQUEST_TYPES, STATUSES, type RequestType, type Status } from './db'
import { json, err } from './http'
import { fireNotifications, type RequestRow } from './notifications'
import { canAccessCountry, countryScopeSQL, type UserAccess } from './access'

interface RequestWithCountry extends RequestRow {
  status: Status
  country_name: string
  country_code: string
  created_at: string
  updated_at: string
}

export async function getRequests(access: UserAccess, searchParams: URLSearchParams) {
  const conditions: string[] = []
  const params: unknown[] = []

  const countryId = searchParams.get('country_id')
  const type = searchParams.get('type')
  const status = searchParams.get('status')

  if (countryId) {
    conditions.push('r.country_id = ?')
    params.push(parseInt(countryId))
  }
  if (type && REQUEST_TYPES.includes(type as RequestType)) {
    conditions.push('r.type = ?')
    params.push(type)
  }
  if (status && STATUSES.includes(status as Status)) {
    conditions.push('r.status = ?')
    params.push(status)
  }
  const scope = countryScopeSQL(access, 'r')
  if (scope) {
    conditions.push(scope.clause)
    params.push(...scope.params)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '') || 50, 200)
  const offset = Math.max(parseInt(searchParams.get('offset') || '') || 0, 0)

  const rows = await dbAll<RequestWithCountry>(
    `SELECT r.*, c.name AS country_name, c.code AS country_code
     FROM requests r JOIN countries c ON c.id = r.country_id
     ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )
  const totalRow = await dbFirst<{ count: number }>(`SELECT COUNT(*) AS count FROM requests r ${where}`, params)
  return json({ total: totalRow!.count, limit, offset, data: rows })
}

export async function getRequest(access: UserAccess, id: number) {
  const row = await dbFirst<RequestWithCountry>(
    `SELECT r.*, c.name AS country_name, c.code AS country_code
     FROM requests r JOIN countries c ON c.id = r.country_id WHERE r.id = ?`,
    [id],
  )
  if (!row) return err('Request not found', 404)
  if (!canAccessCountry(access, row.country_id)) return err('Request not found', 404)
  return json(row)
}

interface CreateRequestBody {
  country_id?: number | string
  type?: RequestType
  permalink?: string
  lock_level?: number | null
  editor_rank?: number | null
  notes?: string | null
  submitted_by?: string | null
  // Key of a screenshot already uploaded via POST /api/screenshots — attached at creation
  // time (rather than via a follow-up call) so it's present when notifications fire.
  screenshot_key?: string | null
}

export async function createRequest(body: CreateRequestBody) {
  const { country_id, type, permalink, lock_level, editor_rank, notes, submitted_by, screenshot_key } = body

  if (!country_id || !Number.isInteger(Number(country_id))) return err('country_id is required')
  if (!type || !REQUEST_TYPES.includes(type)) return err(`type must be one of: ${REQUEST_TYPES.join(', ')}`)
  if (!permalink?.trim()) return err('permalink is required')
  if (lock_level != null && (lock_level < 1 || lock_level > 7)) return err('lock_level must be between 1 and 7')
  if (editor_rank != null && (editor_rank < 1 || editor_rank > 6)) return err('editor_rank must be between 1 and 6')
  if (type === 'downlock' && lock_level != null && editor_rank != null && editor_rank >= lock_level) {
    return err("Your editor rank already covers this segment's lock level; no downlock request needed.")
  }

  const country = await dbFirst<{ id: number; name: string; code: string }>('SELECT * FROM countries WHERE id = ?', [
    Number(country_id),
  ])
  if (!country) return err('Country not found', 404)

  const effectiveLock = type === 'downlock' ? (lock_level ?? null) : null

  const result = await dbRun(
    `INSERT INTO requests (country_id, type, permalink, lock_level, editor_rank, notes, submitted_by, screenshot_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(country_id),
      type,
      permalink.trim(),
      effectiveLock,
      editor_rank ?? null,
      notes || null,
      submitted_by?.trim() || null,
      screenshot_key?.trim() || null,
    ],
  )

  const row = await dbFirst<RequestWithCountry>(
    `SELECT r.*, c.name AS country_name, c.code AS country_code
     FROM requests r JOIN countries c ON c.id = r.country_id WHERE r.id = ?`,
    [result.meta.last_row_id],
  )

  // Fire notifications in the background (non-blocking)
  waitUntil(fireNotifications(row!, country.name, country.code))

  return json(row, 201)
}

export async function updateRequest(
  access: UserAccess,
  id: number,
  body: { status?: Status; notes?: string | null },
) {
  const existing = await dbFirst<RequestWithCountry>('SELECT * FROM requests WHERE id = ?', [id])
  if (!existing) return err('Request not found', 404)
  if (!canAccessCountry(access, existing.country_id)) return err('Request not found', 404)

  const status = body.status && STATUSES.includes(body.status) ? body.status : existing.status
  const notes = body.notes !== undefined ? body.notes : existing.notes

  await dbRun(
    `UPDATE requests SET status=?, notes=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
    [status, notes, id],
  )
  const row = await dbFirst<RequestWithCountry>(
    `SELECT r.*, c.name AS country_name, c.code AS country_code
     FROM requests r JOIN countries c ON c.id = r.country_id WHERE r.id = ?`,
    [id],
  )
  return json(row)
}

export async function deleteRequest(access: UserAccess, id: number) {
  const existing = await dbFirst<RequestWithCountry>('SELECT * FROM requests WHERE id = ?', [id])
  if (!existing) return err('Request not found', 404)
  if (!canAccessCountry(access, existing.country_id)) return err('Request not found', 404)
  const result = await dbRun('DELETE FROM requests WHERE id = ?', [id])
  if (!result.meta.changes) return err('Request not found', 404)
  return new Response(null, { status: 204 })
}
