import { dbAll, REQUEST_TYPES, type RequestType } from './db'
import { json } from './http'
import { countryScopeSQL, type UserAccess } from './access'

type UserCounts = Record<RequestType, number>

function emptyCounts(): UserCounts {
  return Object.fromEntries(REQUEST_TYPES.map((t) => [t, 0])) as UserCounts
}

export async function getUserReport(access: UserAccess) {
  // Requests are purged 24h after submission (see src/server-entry.ts), rolling their counts
  // into request_stats first — so a full picture needs both: live rows for anything not yet
  // purged, plus the aggregated historical counts.
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

  const rows = await dbAll<{ submitted_by: string; type: RequestType; count: number }>(
    `SELECT submitted_by, type, SUM(count) AS count
     FROM (
       SELECT submitted_by, type, COUNT(*) AS count
       FROM requests r
       WHERE ${liveWhere.join(' AND ')}
       GROUP BY submitted_by, type
       UNION ALL
       SELECT submitted_by, type, count
       FROM request_stats rs
       ${statsWhereClause}
     )
     GROUP BY submitted_by, type`,
    [...liveParams, ...statsParams],
  )

  const byUser = new Map<string, UserCounts>()
  for (const row of rows) {
    const entry = byUser.get(row.submitted_by) ?? emptyCounts()
    entry[row.type] = row.count
    byUser.set(row.submitted_by, entry)
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

  return json({ data })
}
