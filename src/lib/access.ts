import { dbAll, dbFirst } from './db'

export interface UserAccess {
  userId: string
  isGlobal: boolean
  countryIds: number[]
}

/**
 * The user's access to this app, or `null` if they have none: any WMEKit account can sign in,
 * but only users an admin has added (a `user_access` row) get in.
 */
export async function getUserAccess(userId: string): Promise<UserAccess | null> {
  const row = await dbFirst<{ is_global: number }>(`SELECT is_global FROM user_access WHERE user_id = ?`, [userId])
  if (!row) return null
  const isGlobal = row.is_global === 1
  const countryIds = isGlobal
    ? []
    : (
        await dbAll<{ country_id: number }>(`SELECT country_id FROM user_countries WHERE user_id = ?`, [userId])
      ).map((r) => r.country_id)
  return { userId, isGlobal, countryIds }
}

export function canAccessCountry(access: UserAccess, countryId: number) {
  return access.isGlobal || access.countryIds.includes(countryId)
}

// A SQL fragment restricting `${alias}.country_id` to the caller's allowed countries, plus its
// bind params — or `null` when the caller is global and no restriction is needed. A scoped user
// with zero assigned countries gets a fragment that always evaluates false (empty result set)
// rather than an invalid empty `IN ()`.
export function countryScopeSQL(access: UserAccess, alias = 'r'): { clause: string; params: number[] } | null {
  if (access.isGlobal) return null
  if (!access.countryIds.length) return { clause: '1 = 0', params: [] }
  const placeholders = access.countryIds.map(() => '?').join(',')
  return { clause: `${alias}.country_id IN (${placeholders})`, params: access.countryIds }
}
