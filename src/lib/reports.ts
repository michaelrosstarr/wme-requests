import { dbAll, REQUEST_TYPES, type RequestType } from './db'
import { json } from './http'
import { countryScopeSQL, type UserAccess } from './access'

type UserCounts = Record<RequestType, number>

function emptyCounts(): UserCounts {
  return Object.fromEntries(REQUEST_TYPES.map((t) => [t, 0])) as UserCounts
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
