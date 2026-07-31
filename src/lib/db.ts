import { env } from 'cloudflare:workers'

export function getDb() {
  return env.DB
}

export async function dbAll<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { results } = await getDb().prepare(sql).bind(...params).all<T>()
  return results
}

export async function dbFirst<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  return getDb().prepare(sql).bind(...params).first<T>()
}

export async function dbRun(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).bind(...params).run()
}

export const PLATFORMS = ['slack', 'discord', 'telegram', 'email', 'webhook', 'google_sheets'] as const
export const EVENT_TYPES = ['global', 'downlock', 'imagery'] as const
export const REQUEST_TYPES = ['downlock', 'imagery'] as const
export const STATUSES = ['pending', 'in_progress', 'completed', 'rejected'] as const
export const CREDENTIAL_TYPES = [
  'google_service_account',
  'email_postmark',
  'email_mailgun',
  'email_smtp',
] as const

export type Platform = (typeof PLATFORMS)[number]
export type EventType = (typeof EVENT_TYPES)[number]
export type RequestType = (typeof REQUEST_TYPES)[number]
export type Status = (typeof STATUSES)[number]
export type CredentialType = (typeof CREDENTIAL_TYPES)[number]

export function isURL(s: string) {
  try {
    new URL(s)
    return true
  } catch {
    return false
  }
}

export function isEmail(s: string) {
  const at = s.indexOf('@')
  if (at <= 0 || at !== s.lastIndexOf('@') || s.includes(' ')) return false
  const domain = s.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  return dot > 0 && dot < domain.length - 1
}
