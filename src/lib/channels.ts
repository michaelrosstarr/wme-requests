import { dbAll, dbFirst, dbRun, isURL, isEmail, PLATFORMS, EVENT_TYPES, type Platform, type EventType } from './db'
import { json, err } from './http'
import { sendTestMessage, type NotificationChannel } from './notifications'
import { canAccessCountry, type UserAccess } from './access'
import { encryptSecret } from './crypto'
import type { GoogleServiceAccount } from './google-sheets'

// google_credentials_encrypted never leaves the server — API consumers only ever see
// whether a channel has credentials configured, via has_google_credentials.
function sanitizeChannel(channel: NotificationChannel & { region_name?: string | null; region_code?: string | null }) {
  const { google_credentials_encrypted, ...rest } = channel
  return { ...rest, has_google_credentials: !!google_credentials_encrypted }
}

export async function getChannels(access: UserAccess, countryId: number) {
  const country = await dbFirst('SELECT id FROM countries WHERE id = ?', [countryId])
  if (!country) return err('Country not found', 404)
  if (!canAccessCountry(access, countryId)) return err('Country not found', 404)
  const rows = await dbAll<NotificationChannel & { region_name: string | null; region_code: string | null }>(
    `SELECT ch.*, g.name AS region_name, g.code AS region_code
     FROM notification_channels ch LEFT JOIN regions g ON g.id = ch.region_id
     WHERE ch.country_id = ? ORDER BY ch.event_type, ch.platform`,
    [countryId],
  )
  return json(rows.map(sanitizeChannel))
}

interface ChannelBody {
  label?: string
  platform?: Platform
  event_type?: EventType
  // Optional — scopes the channel to one region within the country instead of the whole
  // country. null/omitted means country-wide, the pre-existing behaviour.
  region_id?: number | string | null
  webhook_url?: string | null
  bot_token?: string | null
  chat_id?: string | null
  custom_prefix?: string | null
  email_to?: string | null
  discord_forum?: boolean
  spreadsheet_id?: string | null
  sheet_name?: string | null
  // Raw service account JSON pasted in the form — never stored as-is. On update, omitting
  // this (undefined) keeps the channel's existing encrypted credentials; the client never
  // gets the plaintext back to resubmit unchanged, so "leave blank to keep" is the only option.
  google_service_account_json?: string | null
}

// Resolves+validates an optional region_id against the channel's country. Returns the
// normalized region id (or null), or an error message.
async function resolveRegionId(countryId: number, regionId: ChannelBody['region_id']): Promise<{ id: number | null } | { error: string }> {
  if (regionId == null || regionId === '') return { id: null }
  if (!Number.isInteger(Number(regionId))) return { error: 'region_id must be an integer' }
  const region = await dbFirst('SELECT id FROM regions WHERE id = ? AND country_id = ?', [Number(regionId), countryId])
  if (!region) return { error: 'Region not found for this country' }
  return { id: Number(regionId) }
}

// Returns an error message if the platform-specific required fields are missing/invalid, else null.
function validatePlatformFields(
  platform: Platform,
  fields: Pick<ChannelBody, 'webhook_url' | 'bot_token' | 'chat_id' | 'email_to' | 'spreadsheet_id'>,
) {
  const { webhook_url, bot_token, chat_id, email_to, spreadsheet_id } = fields
  if (platform === 'slack' || platform === 'discord' || platform === 'webhook') {
    if (!webhook_url) return `webhook_url is required for ${platform}`
    if (!isURL(webhook_url)) return 'webhook_url must be a valid URL'
  }
  if (platform === 'telegram' && (!bot_token || !chat_id)) return 'bot_token and chat_id are required for telegram'
  if (platform === 'email') {
    if (!email_to) return 'email_to is required for email'
    if (!isEmail(email_to)) return 'email_to must be a valid email address'
  }
  if (platform === 'google_sheets' && !spreadsheet_id?.trim()) return 'spreadsheet_id is required for google_sheets'
  return null
}

// Parses+validates a pasted Google service account key. Returns the encrypted string to
// store, or an error message.
async function encryptGoogleCredentials(raw: string): Promise<{ encrypted: string } | { error: string }> {
  let parsed: Partial<GoogleServiceAccount>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'Google service account key must be valid JSON' }
  }
  if (!parsed.client_email || !parsed.private_key) {
    return { error: 'Google service account JSON must include client_email and private_key' }
  }
  return { encrypted: await encryptSecret(raw) }
}

export async function createChannel(access: UserAccess, countryId: number, body: ChannelBody) {
  const country = await dbFirst('SELECT id FROM countries WHERE id = ?', [countryId])
  if (!country) return err('Country not found', 404)
  if (!canAccessCountry(access, countryId)) return err('Country not found', 404)

  const {
    label,
    platform,
    event_type,
    region_id,
    webhook_url,
    bot_token,
    chat_id,
    custom_prefix,
    email_to,
    discord_forum,
    spreadsheet_id,
    sheet_name,
    google_service_account_json,
  } = body
  if (!label?.trim()) return err('label is required')
  if (!platform || !PLATFORMS.includes(platform)) return err(`platform must be one of: ${PLATFORMS.join(', ')}`)
  if (!event_type || !EVENT_TYPES.includes(event_type))
    return err(`event_type must be one of: ${EVENT_TYPES.join(', ')}`)

  const resolvedRegion = await resolveRegionId(countryId, region_id)
  if ('error' in resolvedRegion) return err(resolvedRegion.error)

  const platformError = validatePlatformFields(platform, { webhook_url, bot_token, chat_id, email_to, spreadsheet_id })
  if (platformError) return err(platformError)

  let googleCredentialsEncrypted: string | null = null
  if (platform === 'google_sheets') {
    if (!google_service_account_json?.trim()) return err('A Google service account key is required for google_sheets')
    const result = await encryptGoogleCredentials(google_service_account_json.trim())
    if ('error' in result) return err(result.error)
    googleCredentialsEncrypted = result.encrypted
  }

  const result = await dbRun(
    `INSERT INTO notification_channels
       (country_id, region_id, label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to, discord_forum, spreadsheet_id, sheet_name, google_credentials_encrypted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      countryId,
      resolvedRegion.id,
      label.trim(),
      platform,
      event_type,
      webhook_url || null,
      bot_token || null,
      chat_id || null,
      custom_prefix?.trim() || null,
      email_to?.trim() || null,
      discord_forum ? 1 : 0,
      spreadsheet_id?.trim() || null,
      sheet_name?.trim() || null,
      googleCredentialsEncrypted,
    ],
  )
  const row = await dbFirst<NotificationChannel>('SELECT * FROM notification_channels WHERE id = ?', [
    result.meta.last_row_id,
  ])
  return json(sanitizeChannel(row!), 201)
}

export async function updateChannel(access: UserAccess, id: number, body: ChannelBody) {
  const existing = await dbFirst<NotificationChannel>('SELECT * FROM notification_channels WHERE id = ?', [id])
  if (!existing) return err('Channel not found', 404)
  if (!canAccessCountry(access, existing.country_id)) return err('Channel not found', 404)

  const label = body.label?.trim() || existing.label
  const platform = body.platform && PLATFORMS.includes(body.platform) ? body.platform : existing.platform
  const event_type = body.event_type && EVENT_TYPES.includes(body.event_type) ? body.event_type : existing.event_type

  let region_id = existing.region_id
  if (body.region_id !== undefined) {
    const resolvedRegion = await resolveRegionId(existing.country_id, body.region_id)
    if ('error' in resolvedRegion) return err(resolvedRegion.error)
    region_id = resolvedRegion.id
  }

  const webhook_url = body.webhook_url !== undefined ? body.webhook_url : existing.webhook_url
  const bot_token = body.bot_token !== undefined ? body.bot_token : existing.bot_token
  const chat_id = body.chat_id !== undefined ? body.chat_id : existing.chat_id
  const custom_prefix =
    body.custom_prefix !== undefined ? body.custom_prefix?.trim() || null : existing.custom_prefix
  const email_to = body.email_to !== undefined ? body.email_to?.trim() || null : existing.email_to
  const discord_forum = body.discord_forum !== undefined ? (body.discord_forum ? 1 : 0) : existing.discord_forum
  const spreadsheet_id =
    body.spreadsheet_id !== undefined ? body.spreadsheet_id?.trim() || null : existing.spreadsheet_id
  const sheet_name = body.sheet_name !== undefined ? body.sheet_name?.trim() || null : existing.sheet_name

  let googleCredentialsEncrypted = existing.google_credentials_encrypted
  if (body.google_service_account_json?.trim()) {
    const result = await encryptGoogleCredentials(body.google_service_account_json.trim())
    if ('error' in result) return err(result.error)
    googleCredentialsEncrypted = result.encrypted
  }
  if (platform === 'google_sheets' && !googleCredentialsEncrypted) {
    return err('A Google service account key is required for google_sheets')
  }

  await dbRun(
    `UPDATE notification_channels
     SET label=?, platform=?, event_type=?, region_id=?, webhook_url=?, bot_token=?, chat_id=?, custom_prefix=?, email_to=?,
         discord_forum=?, spreadsheet_id=?, sheet_name=?, google_credentials_encrypted=?
     WHERE id=?`,
    [
      label,
      platform,
      event_type,
      region_id,
      webhook_url,
      bot_token,
      chat_id,
      custom_prefix,
      email_to,
      discord_forum,
      spreadsheet_id,
      sheet_name,
      googleCredentialsEncrypted,
      id,
    ],
  )
  const row = await dbFirst<NotificationChannel>('SELECT * FROM notification_channels WHERE id = ?', [id])
  return json(sanitizeChannel(row!))
}

export async function deleteChannel(access: UserAccess, id: number) {
  const existing = await dbFirst<NotificationChannel>('SELECT * FROM notification_channels WHERE id = ?', [id])
  if (!existing) return err('Channel not found', 404)
  if (!canAccessCountry(access, existing.country_id)) return err('Channel not found', 404)
  const result = await dbRun('DELETE FROM notification_channels WHERE id = ?', [id])
  if (!result.meta.changes) return err('Channel not found', 404)
  return new Response(null, { status: 204 })
}

export async function testChannel(access: UserAccess, id: number) {
  const channel = await dbFirst<NotificationChannel>('SELECT * FROM notification_channels WHERE id = ?', [id])
  if (!channel) return err('Channel not found', 404)
  if (!canAccessCountry(access, channel.country_id)) return err('Channel not found', 404)
  const country = await dbFirst<{ name: string; code: string }>('SELECT name, code FROM countries WHERE id = ?', [
    channel.country_id,
  ])
  if (!country) return err('Country not found', 404)

  let region: { name: string; code: string } | null = null
  if (channel.region_id != null) {
    region = await dbFirst('SELECT name, code FROM regions WHERE id = ?', [channel.region_id])
  }

  const result = await sendTestMessage(channel, country.name, country.code, region?.name ?? null, region?.code ?? null)
  if (!result.ok) return err(result.error || 'Failed to send test notification', 502)
  return json({ ok: true })
}
