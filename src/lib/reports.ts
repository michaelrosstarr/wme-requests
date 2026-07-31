import { dbAll, type RequestType } from './db'
import { json } from './http'
import { countryScopeSQL, type UserAccess } from './access'

interface UserCounts {
  downlock: number
  imagery: number
}

export async function getUserReport(access: UserAccess) {
  const scope = countryScopeSQL(access, 'requests')
  const where = ["submitted_by IS NOT NULL", "submitted_by != ''"]
  const params: number[] = []
  if (scope) {
    where.push(scope.clause)
    params.push(...scope.params)
  }
  const rows = await dbAll<{ submitted_by: string; type: RequestType; count: number }>(
    `SELECT submitted_by, type, COUNT(*) AS count
     FROM requests
     WHERE ${where.join(' AND ')}
     GROUP BY submitted_by, type`,
    params,
  )

  const byUser = new Map<string, UserCounts>()
  for (const row of rows) {
    const entry = byUser.get(row.submitted_by) ?? { downlock: 0, imagery: 0 }
    entry[row.type] = row.count
    byUser.set(row.submitted_by, entry)
  }

  const data = [...byUser.entries()]
    .map(([submittedBy, counts]) => {
      const total = counts.downlock + counts.imagery
      const majorityType: RequestType | 'tie' =
        counts.downlock === counts.imagery ? 'tie' : counts.downlock > counts.imagery ? 'downlock' : 'imagery'
      return {
        submitted_by: submittedBy,
        downlock_count: counts.downlock,
        imagery_count: counts.imagery,
        total,
        majority_type: majorityType,
      }
    })
    .sort((a, b) => b.total - a.total)

  return json({ data })
}
