import { dbAll, dbFirst, dbRun, EVENT_TYPES, type EventType, type RequestType } from './db'
import { json, err } from './http'
import { canAccessCountry, type UserAccess } from './access'

export interface PushSubscriptionRow {
  id: number
  user_id: string
  country_id: number
  region_id: number | null
  event_type: EventType
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

export async function listMySubscriptions(access: UserAccess) {
  const rows = await dbAll(
    `SELECT s.id, s.country_id, s.region_id, s.event_type, s.created_at,
            c.name AS country_name, c.code AS country_code,
            g.name AS region_name, g.code AS region_code
     FROM push_subscriptions s
     JOIN countries c ON c.id = s.country_id
     LEFT JOIN regions g ON g.id = s.region_id
     WHERE s.user_id = ?
     ORDER BY s.created_at DESC`,
    [access.userId],
  )
  return json(rows)
}

interface SubscribeBody {
  country_id?: number | string
  region_id?: number | string | null
  event_type?: EventType
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
}

export async function subscribe(access: UserAccess, body: SubscribeBody) {
  const countryId = Number(body.country_id)
  if (!body.country_id || !Number.isInteger(countryId)) return err('country_id is required')
  if (!canAccessCountry(access, countryId)) return err('Country not found', 404)

  const country = await dbFirst('SELECT id FROM countries WHERE id = ?', [countryId])
  if (!country) return err('Country not found', 404)

  let regionId: number | null = null
  if (body.region_id != null && body.region_id !== '') {
    if (!Number.isInteger(Number(body.region_id))) return err('region_id must be an integer')
    const region = await dbFirst('SELECT id FROM regions WHERE id = ? AND country_id = ?', [
      Number(body.region_id),
      countryId,
    ])
    if (!region) return err('Region not found for this country')
    regionId = Number(body.region_id)
  }

  const eventType = body.event_type && EVENT_TYPES.includes(body.event_type) ? body.event_type : 'global'

  const endpoint = body.subscription?.endpoint
  const p256dh = body.subscription?.keys?.p256dh
  const auth = body.subscription?.keys?.auth
  if (!endpoint || !p256dh || !auth) return err('A valid push subscription is required')

  const existing = await dbFirst<{ id: number }>(
    `SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ? AND country_id = ? AND region_id IS ?`,
    [access.userId, endpoint, countryId, regionId],
  )
  if (existing) {
    await dbRun(`UPDATE push_subscriptions SET p256dh=?, auth=?, event_type=? WHERE id=?`, [
      p256dh,
      auth,
      eventType,
      existing.id,
    ])
    return json({ id: existing.id })
  }

  const result = await dbRun(
    `INSERT INTO push_subscriptions (user_id, country_id, region_id, event_type, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [access.userId, countryId, regionId, eventType, endpoint, p256dh, auth],
  )
  return json({ id: result.meta.last_row_id }, 201)
}

export async function unsubscribe(access: UserAccess, id: number) {
  const existing = await dbFirst<{ id: number; user_id: string }>(
    'SELECT id, user_id FROM push_subscriptions WHERE id = ?',
    [id],
  )
  if (existing?.user_id !== access.userId) return err('Subscription not found', 404)
  await dbRun('DELETE FROM push_subscriptions WHERE id = ?', [id])
  return new Response(null, { status: 204 })
}

// --- Internal helpers for notifications.ts — not exposed via the API ---

// Same region-priority-then-country-wide-fallback shape as audienceChannels() in
// src/lib/notifications.ts.
export async function audiencePushSubscriptions(countryId: number, regionId: number | null, requestType: RequestType) {
  if (regionId) {
    const regionSubs = await dbAll<PushSubscriptionRow>(
      `SELECT * FROM push_subscriptions WHERE region_id = ? AND event_type IN ('global', ?)`,
      [regionId, requestType],
    )
    if (regionSubs.length) return regionSubs
  }
  return dbAll<PushSubscriptionRow>(
    `SELECT * FROM push_subscriptions WHERE country_id = ? AND region_id IS NULL AND event_type IN ('global', ?)`,
    [countryId, requestType],
  )
}

export async function deleteSubscriptionById(id: number) {
  await dbRun('DELETE FROM push_subscriptions WHERE id = ?', [id])
}
