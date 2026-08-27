import { dbAll, dbFirst, REQUEST_TYPES, type RequestType } from './db'

interface FeedRequestRow {
  id: number
  type: RequestType
  permalink: string
  lock_level: number | null
  notes: string | null
  submitted_by: string | null
  created_at: string
}

const XML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

function escapeXml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => XML_ENTITIES[c])
}

function rfc822(iso: string) {
  return new Date(iso).toUTCString()
}

const TYPE_LABELS: Record<RequestType, string> = {
  downlock: 'Downlock',
  uplock: 'Uplock',
  imagery: 'Imagery',
  accept_pur: 'Accept PUR',
  decline_pur: 'Decline PUR',
}

function typeLabel(type: RequestType) {
  return TYPE_LABELS[type]
}

// A read-only RSS 2.0 feed of recent requests — the pull-based counterpart to notification
// channels and Web Push. Public and unscoped, same as the dashboard's own anonymous view (see
// getRequests in src/lib/requests.ts): there's no per-viewer "which country can you see"
// concept for anonymous callers.
export async function getFeed(searchParams: URLSearchParams, origin: string): Promise<Response> {
  const countryId = searchParams.get('country_id')
  const regionId = searchParams.get('region_id')
  const type = searchParams.get('type')

  const conditions: string[] = []
  const params: unknown[] = []
  if (countryId) {
    conditions.push('r.country_id = ?')
    params.push(parseInt(countryId))
  }
  if (regionId) {
    conditions.push('r.region_id = ?')
    params.push(parseInt(regionId))
  }
  if (type && REQUEST_TYPES.includes(type as RequestType)) {
    conditions.push('r.type = ?')
    params.push(type)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = await dbAll<FeedRequestRow>(
    `SELECT r.id, r.type, r.permalink, r.lock_level, r.notes, r.submitted_by, r.created_at
     FROM requests r
     ${where}
     ORDER BY r.created_at DESC
     LIMIT 50`,
    params,
  )

  let scopeLabel = 'All Countries'
  if (countryId) {
    const country = await dbFirst<{ name: string }>('SELECT name FROM countries WHERE id = ?', [Number(countryId)])
    scopeLabel = country?.name ?? scopeLabel
    if (regionId) {
      const region = await dbFirst<{ name: string }>('SELECT name FROM regions WHERE id = ? AND country_id = ?', [
        Number(regionId),
        Number(countryId),
      ])
      if (region) scopeLabel = `${region.name}, ${scopeLabel}`
    }
  }
  if (type && REQUEST_TYPES.includes(type as RequestType)) scopeLabel = `${typeLabel(type as RequestType)} — ${scopeLabel}`

  const items = rows
    .map((r) => {
      const title = `${typeLabel(r.type)} Request${r.lock_level != null ? ` (Lock ${r.lock_level})` : ''}`
      const descriptionParts = [r.notes, r.submitted_by ? `Submitted by ${r.submitted_by}` : null].filter(
        (v): v is string => !!v,
      )
      return `  <item>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(r.permalink)}</link>
    <guid isPermaLink="false">wme-request-${r.id}</guid>
    <pubDate>${rfc822(r.created_at)}</pubDate>
    <description>${escapeXml(descriptionParts.join(' — ') || title)}</description>
  </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>WME Requests — ${escapeXml(scopeLabel)}</title>
  <link>${escapeXml(origin)}</link>
  <description>Recent Waze Map Editor requests — ${escapeXml(scopeLabel)}</description>
${items}
</channel>
</rss>
`

  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
