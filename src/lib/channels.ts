import { dbAll, dbFirst, dbRun, isURL, isEmail, PLATFORMS, EVENT_TYPES, type Platform, type EventType } from './db'
import { json, err } from './http'
import { sendTestMessage, type NotificationChannel } from './notifications'

export async function getChannels(countryId: number) {
  const country = await dbFirst('SELECT id FROM countries WHERE id = ?', [countryId])
  if (!country) return err('Country not found', 404)
  const rows = await dbAll<NotificationChannel>(
    'SELECT * FROM notification_channels WHERE country_id = ? ORDER BY event_type, platform',
    [countryId],
  )
  return json(rows)
}

interface ChannelBody {
  label?: string
  platform?: Platform
  event_type?: EventType
  webhook_url?: string | null
  bot_token?: string | null
  chat_id?: string | null
  custom_prefix?: string | null
  email_to?: string | null
}

// Returns an error message if the platform-specific required fields are missing/invalid, else null.
function validatePlatformFields(
  platform: Platform,
  fields: Pick<ChannelBody, 'webhook_url' | 'bot_token' | 'chat_id' | 'email_to'>,
) {
  const { webhook_url, bot_token, chat_id, email_to } = fields
  if (platform === 'slack' || platform === 'discord' || platform === 'webhook') {
    if (!webhook_url) return `webhook_url is required for ${platform}`
    if (!isURL(webhook_url)) return 'webhook_url must be a valid URL'
  }
  if (platform === 'telegram' && (!bot_token || !chat_id)) return 'bot_token and chat_id are required for telegram'
  if (platform === 'email') {
    if (!email_to) return 'email_to is required for email'
    if (!isEmail(email_to)) return 'email_to must be a valid email address'
  }
  return null
}

export async function createChannel(countryId: number, body: ChannelBody) {
  const country = await dbFirst('SELECT id FROM countries WHERE id = ?', [countryId])
  if (!country) return err('Country not found', 404)

  const { label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to } = body
  if (!label?.trim()) return err('label is required')
  if (!platform || !PLATFORMS.includes(platform)) return err(`platform must be one of: ${PLATFORMS.join(', ')}`)
  if (!event_type || !EVENT_TYPES.includes(event_type))
    return err(`event_type must be one of: ${EVENT_TYPES.join(', ')}`)

  const platformError = validatePlatformFields(platform, { webhook_url, bot_token, chat_id, email_to })
  if (platformError) return err(platformError)

  const result = await dbRun(
    `INSERT INTO notification_channels (country_id, label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      countryId,
      label.trim(),
      platform,
      event_type,
      webhook_url || null,
      bot_token || null,
      chat_id || null,
      custom_prefix?.trim() || null,
      email_to?.trim() || null,
    ],
  )
  const row = await dbFirst<NotificationChannel>('SELECT * FROM notification_channels WHERE id = ?', [
    result.meta.last_row_id,
  ])
  return json(row, 201)
}

export async function updateChannel(id: number, body: ChannelBody) {
  const existing = await dbFirst<NotificationChannel>('SELECT * FROM notification_channels WHERE id = ?', [id])
  if (!existing) return err('Channel not found', 404)

  const label = body.label?.trim() || existing.label
  const platform = body.platform && PLATFORMS.includes(body.platform) ? body.platform : existing.platform
  const event_type = body.event_type && EVENT_TYPES.includes(body.event_type) ? body.event_type : existing.event_type
  const webhook_url = body.webhook_url !== undefined ? body.webhook_url : existing.webhook_url
  const bot_token = body.bot_token !== undefined ? body.bot_token : existing.bot_token
  const chat_id = body.chat_id !== undefined ? body.chat_id : existing.chat_id
  const custom_prefix =
    body.custom_prefix !== undefined ? body.custom_prefix?.trim() || null : existing.custom_prefix
  const email_to = body.email_to !== undefined ? body.email_to?.trim() || null : existing.email_to

  await dbRun(
    `UPDATE notification_channels
     SET label=?, platform=?, event_type=?, webhook_url=?, bot_token=?, chat_id=?, custom_prefix=?, email_to=?
     WHERE id=?`,
    [label, platform, event_type, webhook_url, bot_token, chat_id, custom_prefix, email_to, id],
  )
  const row = await dbFirst<NotificationChannel>('SELECT * FROM notification_channels WHERE id = ?', [id])
  return json(row)
}

export async function deleteChannel(id: number) {
  const result = await dbRun('DELETE FROM notification_channels WHERE id = ?', [id])
  if (!result.meta.changes) return err('Channel not found', 404)
  return new Response(null, { status: 204 })
}

export async function testChannel(id: number) {
  const channel = await dbFirst<NotificationChannel>('SELECT * FROM notification_channels WHERE id = ?', [id])
  if (!channel) return err('Channel not found', 404)
  const country = await dbFirst<{ name: string; code: string }>('SELECT name, code FROM countries WHERE id = ?', [
    channel.country_id,
  ])
  if (!country) return err('Country not found', 404)
  const result = await sendTestMessage(channel, country.name, country.code)
  if (!result.ok) return err(result.error || 'Failed to send test notification', 502)
  return json({ ok: true })
}
