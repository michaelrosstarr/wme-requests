import { dbFirst, dbRun } from './db'
import { getUserAccess, type UserAccess } from './access'

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function rotateFeedToken(userId: string): Promise<string> {
  const token = generateToken()
  await dbRun(`UPDATE user_access SET feed_token = ? WHERE user_id = ?`, [token, userId])
  return token
}

export async function getOrCreateFeedToken(userId: string): Promise<string> {
  const row = await dbFirst<{ feed_token: string | null }>(`SELECT feed_token FROM user_access WHERE user_id = ?`, [userId])
  return row?.feed_token || rotateFeedToken(userId)
}

// Resolves a feed token to its owner's country access, or `null` if no user holds that token
// (removing someone's access deletes their user_access row, and with it the token).
export async function getAccessForFeedToken(token: string): Promise<UserAccess | null> {
  const row = await dbFirst<{ user_id: string }>(`SELECT user_id FROM user_access WHERE feed_token = ?`, [token])
  return row ? getUserAccess(row.user_id) : null
}
