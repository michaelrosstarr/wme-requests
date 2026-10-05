import { dbAll, REQUEST_TYPES, type RequestType } from './db'
import { json } from './http'
import { countryScopeSQL, type UserAccess } from './access'

type UserCounts = Record<RequestType, number>

function emptyCounts(): UserCounts {
  return Object.fromEntries(REQUEST_TYPES.map((t) => [t, 0])) as UserCounts
}

export async function getUserReport(access: UserAccess) {
  // Requests used to be purged 24h after submission, rolling their counts into request_stats
  // first — so a full picture needs both: live rows, plus the counts of the purged ones.
  const liveScope = countryScopeSQL(access, 'r')
  const liveWhere = ["submitted_by IS NOT NULL", "submitted_by != ''"]
  const liveParams: number[] = []
  if (liveScope) {
    liveWhere.push(liveScope.clause)
    liveParams.push(...liveScope.params)
  }

  const statsScope = countryScopeSQL(access, 'rs')
  const statsWhere: string[] = []
  const statsParams: number[] = []
  if (statsScope) {
    statsWhere.push(statsScope.clause)
    statsParams.push(...statsScope.params)
  }
  const statsWhereClause = statsWhere.length ? `WHERE ${statsWhere.join(' AND ')}` : ''

  const rows = await dbAll<{
    submitted_by: string
    country_id: number
    country_name: string
    country_code: string
    type: RequestType
    count: number
  }>(
    `SELECT t.submitted_by, t.country_id, c.name AS country_name, c.code AS country_code, t.type,
            SUM(t.count) AS count
     FROM (
       SELECT submitted_by, country_id, type, COUNT(*) AS count
       FROM requests r
       WHERE ${liveWhere.join(' AND ')}
       GROUP BY submitted_by, country_id, type
       UNION ALL
       SELECT submitted_by, country_id, type, count
       FROM request_stats rs
       ${statsWhereClause}
     ) t
     JOIN countries c ON c.id = t.country_id
     GROUP BY t.submitted_by, t.country_id, t.type`,
    [...liveParams, ...statsParams],
  )

  const byUser = new Map<string, UserCounts>()
  const byCountry = new Map<number, { country_id: number; country_name: string; country_code: string; counts: UserCounts }>()
  for (const row of rows) {
    const userEntry = byUser.get(row.submitted_by) ?? emptyCounts()
    userEntry[row.type] += row.count
    byUser.set(row.submitted_by, userEntry)

    const countryEntry = byCountry.get(row.country_id) ?? {
      country_id: row.country_id,
      country_name: row.country_name,
      country_code: row.country_code,
      counts: emptyCounts(),
    }
    countryEntry.counts[row.type] += row.count
    byCountry.set(row.country_id, countryEntry)
  }

  const data = [...byUser.entries()]
    .map(([submittedBy, counts]) => {
      const total = REQUEST_TYPES.reduce((sum, t) => sum + counts[t], 0)
      const max = Math.max(...REQUEST_TYPES.map((t) => counts[t]))
      const topTypes = REQUEST_TYPES.filter((t) => counts[t] === max)
      const majorityType: RequestType | 'tie' = max === 0 || topTypes.length > 1 ? 'tie' : topTypes[0]
      return {
        submitted_by: submittedBy,
        counts,
        total,
        majority_type: majorityType,
      }
    })
    .sort((a, b) => b.total - a.total)

  const countries = [...byCountry.values()]
    .map((c) => ({ ...c, total: REQUEST_TYPES.reduce((sum, t) => sum + c.counts[t], 0) }))
    .sort((a, b) => b.total - a.total)

  return json({ data, countries })
}
