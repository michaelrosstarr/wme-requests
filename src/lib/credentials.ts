import { dbAll, dbFirst, dbRun, isEmail, CREDENTIAL_TYPES, type CredentialType } from './db'
import { json, err } from './http'
import { encryptSecret, decryptSecret } from './crypto'
import type { UserAccess } from './access'
import type { GoogleServiceAccount } from './google-sheets'
import type { EmailCredentialPayload } from './email/types'

export interface CredentialRow {
  id: number
  type: CredentialType
  owner_user_id: string | null
  label: string
  display_identifier: string | null
  secret_encrypted: string
  created_at: string
  updated_at: string
}

// secret_encrypted never leaves the server — API consumers only ever see the label and the
// non-secret display_identifier (client_email / from-address).
function sanitizeCredential(row: CredentialRow) {
  const { secret_encrypted, ...rest } = row
  return rest
}

// Google credentials are a shared pool (visible to everyone) managed only by global users,
// same as Countries. Email credentials are BYOK — owned by the user who added them; a
// non-global user only ever sees their own.
function requireManageable(access: UserAccess, row: CredentialRow) {
  if (row.type === 'google_service_account') {
    return access.isGlobal ? null : err('Only global users can manage Google service account credentials', 403)
  }
  return access.isGlobal || row.owner_user_id === access.userId ? null : err('Credential not found', 404)
}

function validatePayload(
  type: CredentialType,
  payload: unknown,
): { displayIdentifier: string } | { error: string } {
  if (!payload || typeof payload !== 'object') return { error: 'payload is required' }
  const p = payload as Record<string, unknown>

  if (type === 'google_service_account') {
    const { client_email, private_key } = p as Partial<GoogleServiceAccount>
    if (!client_email || !private_key) return { error: 'client_email and private_key are required' }
    return { displayIdentifier: String(client_email) }
  }
  if (type === 'email_postmark') {
    const { serverToken, fromEmail } = p
    if (!serverToken) return { error: 'serverToken is required' }
    if (!fromEmail || !isEmail(String(fromEmail))) return { error: 'A valid fromEmail is required' }
    return { displayIdentifier: String(fromEmail) }
  }
  if (type === 'email_mailgun') {
    const { apiKey, domain, fromEmail } = p
    if (!apiKey) return { error: 'apiKey is required' }
    if (!domain) return { error: 'domain is required' }
    if (!fromEmail || !isEmail(String(fromEmail))) return { error: 'A valid fromEmail is required' }
    return { displayIdentifier: String(fromEmail) }
  }
  // email_smtp
  const { host, port, username, password, fromEmail } = p
  if (!host) return { error: 'host is required' }
  if (!Number.isInteger(Number(port)) || Number(port) <= 0) return { error: 'A valid port is required' }
  if (!username) return { error: 'username is required' }
  if (!password) return { error: 'password is required' }
  if (!fromEmail || !isEmail(String(fromEmail))) return { error: 'A valid fromEmail is required' }
  return { displayIdentifier: String(fromEmail) }
}

interface CredentialBody {
  type?: CredentialType
  label?: string
  // Raw fields for the chosen `type` (see validatePayload) — write-only, like the channel
  // form's old google_service_account_json field. Never returned by the API after saving.
  payload?: Record<string, unknown>
}

export async function listCredentials(access: UserAccess, type?: CredentialType) {
  const conditions: string[] = []
  const params: unknown[] = []
  if (type) {
    if (!CREDENTIAL_TYPES.includes(type)) return err(`type must be one of: ${CREDENTIAL_TYPES.join(', ')}`)
    conditions.push('type = ?')
    params.push(type)
  }
  if (!access.isGlobal) {
    conditions.push(`(type = 'google_service_account' OR owner_user_id = ?)`)
    params.push(access.userId)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await dbAll<CredentialRow>(`SELECT * FROM credentials ${where} ORDER BY type, label`, params)
  return json(rows.map(sanitizeCredential))
}

export async function createCredential(access: UserAccess, body: CredentialBody) {
  const { type, label } = body
  if (!type || !CREDENTIAL_TYPES.includes(type)) return err(`type must be one of: ${CREDENTIAL_TYPES.join(', ')}`)
  if (!label?.trim()) return err('label is required')
  if (type === 'google_service_account' && !access.isGlobal) {
    return err('Only global users can add Google service account credentials', 403)
  }

  const validated = validatePayload(type, body.payload)
  if ('error' in validated) return err(validated.error)

  const ownerUserId = type === 'google_service_account' ? null : access.userId
  const encrypted = await encryptSecret(JSON.stringify(body.payload))
  const result = await dbRun(
    `INSERT INTO credentials (type, owner_user_id, label, display_identifier, secret_encrypted) VALUES (?, ?, ?, ?, ?)`,
    [type, ownerUserId, label.trim(), validated.displayIdentifier, encrypted],
  )
  const row = await dbFirst<CredentialRow>('SELECT * FROM credentials WHERE id = ?', [result.meta.last_row_id])
  return json(sanitizeCredential(row!), 201)
}

export async function updateCredential(access: UserAccess, id: number, body: CredentialBody) {
  const existing = await dbFirst<CredentialRow>('SELECT * FROM credentials WHERE id = ?', [id])
  if (!existing) return err('Credential not found', 404)
  const denied = requireManageable(access, existing)
  if (denied) return denied

  const label = body.label?.trim() || existing.label
  let displayIdentifier = existing.display_identifier
  let secretEncrypted = existing.secret_encrypted
  if (body.payload) {
    const validated = validatePayload(existing.type, body.payload)
    if ('error' in validated) return err(validated.error)
    displayIdentifier = validated.displayIdentifier
    secretEncrypted = await encryptSecret(JSON.stringify(body.payload))
  }

  await dbRun(
    `UPDATE credentials SET label=?, display_identifier=?, secret_encrypted=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
    [label, displayIdentifier, secretEncrypted, id],
  )
  const row = await dbFirst<CredentialRow>('SELECT * FROM credentials WHERE id = ?', [id])
  return json(sanitizeCredential(row!))
}

export async function deleteCredential(access: UserAccess, id: number) {
  const existing = await dbFirst<CredentialRow>('SELECT * FROM credentials WHERE id = ?', [id])
  if (!existing) return err('Credential not found', 404)
  const denied = requireManageable(access, existing)
  if (denied) return denied
  const result = await dbRun('DELETE FROM credentials WHERE id = ?', [id])
  if (!result.meta.changes) return err('Credential not found', 404)
  return new Response(null, { status: 204 })
}

// --- Internal helpers for notifications.ts / channels.ts — not exposed via the API ---

export async function resolveGoogleCredential(id: number): Promise<GoogleServiceAccount> {
  const row = await dbFirst<CredentialRow>(
    `SELECT * FROM credentials WHERE id = ? AND type = 'google_service_account'`,
    [id],
  )
  if (!row) throw new Error('Google service account credential not found')
  return JSON.parse(await decryptSecret(row.secret_encrypted)) as GoogleServiceAccount
}

export async function resolveEmailCredential(id: number): Promise<EmailCredentialPayload> {
  const row = await dbFirst<CredentialRow>(
    `SELECT * FROM credentials WHERE id = ? AND type IN ('email_postmark','email_mailgun','email_smtp')`,
    [id],
  )
  if (!row) throw new Error('Email credential not found')
  const payload = JSON.parse(await decryptSecret(row.secret_encrypted)) as Record<string, unknown>
  const provider = row.type === 'email_postmark' ? 'postmark' : row.type === 'email_mailgun' ? 'mailgun' : 'smtp'
  return { provider, ...payload } as EmailCredentialPayload
}

// Checks a credential id exists and matches the expected kind (Google or email) before it's
// attached to a channel — cheap existence/type check, no decryption.
export async function credentialExists(id: number, kind: 'google' | 'email'): Promise<boolean> {
  const typeFilter =
    kind === 'google' ? `type = 'google_service_account'` : `type IN ('email_postmark','email_mailgun','email_smtp')`
  const row = await dbFirst<{ id: number }>(`SELECT id FROM credentials WHERE id = ? AND ${typeFilter}`, [id])
  return !!row
}
