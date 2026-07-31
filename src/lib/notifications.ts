import { dbAll } from './db'
import { appendSheetRow } from './google-sheets'
import { screenshotUrl } from './screenshots'
import { resolveGoogleCredential, resolveEmailCredential } from './credentials'
import { sendEmail as dispatchEmail } from './email/send-email'

export interface NotificationChannel {
  id: number
  country_id: number
  region_id: number | null
  label: string
  platform: 'slack' | 'discord' | 'telegram' | 'email' | 'webhook' | 'google_sheets'
  event_type: 'global' | 'downlock' | 'imagery'
  webhook_url: string | null
  bot_token: string | null
  chat_id: string | null
  custom_prefix: string | null
  email_to: string | null
  discord_forum: number
  spreadsheet_id: string | null
  sheet_name: string | null
  google_credential_id: number | null
  email_credential_id: number | null
}

export interface RequestRow {
  id: number
  country_id: number
  region_id: number | null
  type: 'downlock' | 'imagery'
  permalink: string
  lock_level: number | null
  editor_rank: number | null
  notes: string | null
  submitted_by: string | null
  screenshot_key: string | null
}

function userProfileUrl(username: string) {
  return `https://www.waze.com/user/editor/${encodeURIComponent(username)}`
}

// Variables available inside a channel's custom_prefix template, e.g. "L{lock_level}{country_code}".
type PrefixVars = Record<string, string>

function applyPrefixTemplate(template: string, vars: PrefixVars) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match)
}

function buildMessage(request: RequestRow, countryName: string, regionName: string | null) {
  const typeLabel = request.type === 'downlock' ? 'Downlock Request' : 'Imagery Request'
  const place = regionName ? `${regionName}, ${countryName}` : countryName
  const title = `${typeLabel} — ${place}`
  const color = request.type === 'downlock' ? 0xe74c3c : 0x3498db
  return {
    title,
    color,
    permalink: request.permalink,
    lockLevel: request.type === 'downlock' ? request.lock_level : null,
    notes: request.notes,
    submittedBy: request.submitted_by,
    editorRank: request.editor_rank,
    screenshotUrl: screenshotUrl(request.screenshot_key),
  }
}

// Plain (unescaped) permalink/lock-level/notes lines shared by Discord and Telegram —
// the submitter line is built separately by each platform since it includes a link.
function bodyLines(msg: ReturnType<typeof buildMessage>) {
  const lines = [`Permalink: ${msg.permalink}`]
  if (msg.lockLevel != null) lines.push(`Lock Level: ${msg.lockLevel}`)
  if (msg.notes) lines.push(`Notes: ${msg.notes}`)
  return lines
}

function hexColor(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

// Slack incoming webhooks can't open a true modal (that requires a trigger_id from a
// live user interaction) — the closest equivalent is a Block Kit card: a colored side
// bar via a legacy "attachment" wrapping modern blocks, with fields laid out in a grid.
async function sendSlack(webhookUrl: string, msg: ReturnType<typeof buildMessage>, prefix: string | null) {
  const rankSuffix = msg.editorRank != null ? ` (Rank ${msg.editorRank})` : ''
  const fields: Array<{ type: 'mrkdwn'; text: string }> = [
    { type: 'mrkdwn', text: `*Permalink:*\n<${msg.permalink}|Open>` },
  ]
  if (msg.lockLevel != null) fields.push({ type: 'mrkdwn', text: `*Lock Level:*\n${msg.lockLevel}` })
  if (msg.submittedBy) {
    fields.push({
      type: 'mrkdwn',
      text: `*Submitted by:*\n<${userProfileUrl(msg.submittedBy)}|${msg.submittedBy}>${rankSuffix}`,
    })
  }

  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${msg.title}*` } },
    { type: 'section', fields },
  ]
  if (msg.notes) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Notes:*\n${msg.notes}` } })
  }
  if (msg.screenshotUrl) {
    blocks.push({ type: 'image', image_url: msg.screenshotUrl, alt_text: 'Map viewport screenshot' })
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Fallback/notification-preview text — also where the prefix's @mentions actually notify,
      // since attachment blocks aren't reliably parsed for that the same way.
      text: prefix || msg.title,
      attachments: [{ color: hexColor(msg.color), blocks }],
    }),
  })
}

// Forum channels have no general message stream — every webhook post must create a new
// post (thread) via `thread_name`, capped at Discord's 100-character thread name limit.
async function sendDiscord(
  webhookUrl: string,
  msg: ReturnType<typeof buildMessage>,
  prefix: string | null,
  isForumThread: boolean,
) {
  const rankSuffix = msg.editorRank != null ? ` (Rank ${msg.editorRank})` : ''
  const lines = bodyLines(msg)
  if (msg.submittedBy) lines.push(`Submitted by: [${msg.submittedBy}](${userProfileUrl(msg.submittedBy)})${rankSuffix}`)
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: prefix || undefined,
      embeds: [
        {
          title: msg.title,
          description: lines.join('\n'),
          color: msg.color,
          timestamp: new Date().toISOString(),
          ...(msg.screenshotUrl ? { image: { url: msg.screenshotUrl } } : {}),
        },
      ],
      ...(isForumThread ? { thread_name: (prefix || msg.title).slice(0, 100) } : {}),
    }),
  })
}

function escapeMarkdown(text: string) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}

// Telegram's MarkdownV2 link destinations only need ')' and '\' escaped — escaping
// the whole URL with escapeMarkdown would also mangle '/' and ':' and break the link.
function escapeTelegramLinkUrl(url: string) {
  return url.replace(/([)\\])/g, String.raw`\$1`)
}

async function sendTelegram(botToken: string, chatId: string, msg: ReturnType<typeof buildMessage>, prefix: string | null) {
  const prefixLine = prefix ? `${escapeMarkdown(prefix)}\n` : ''
  const rankSuffix = msg.editorRank != null ? escapeMarkdown(` (Rank ${msg.editorRank})`) : ''
  const lines = bodyLines(msg).map(escapeMarkdown)
  if (msg.submittedBy) {
    lines.push(
      `Submitted by: [${escapeMarkdown(msg.submittedBy)}](${escapeTelegramLinkUrl(userProfileUrl(msg.submittedBy))})${rankSuffix}`,
    )
  }
  const text = `*${escapeMarkdown(msg.title)}*\n${prefixLine}${lines.join('\n')}`

  // sendPhoto's caption is capped at 1024 chars (vs sendMessage's 4096) — unlikely to
  // matter for these short messages, but if it's ever exceeded Telegram rejects the
  // whole request rather than truncating, so this isn't silently lossy.
  if (msg.screenshotUrl) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: msg.screenshotUrl, caption: text, parse_mode: 'MarkdownV2' }),
    })
    return
  }

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
  })
}

function escapeHtml(text: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(text).replace(/[&<>"']/g, (c) => entities[c])
}

function buildEmailHtml(msg: ReturnType<typeof buildMessage>, prefix: string | null) {
  const rankSuffix = msg.editorRank != null ? ` (Rank ${msg.editorRank})` : ''
  const parts = [
    prefix ? `<p style="color:#666;margin:0 0 12px">${escapeHtml(prefix)}</p>` : '',
    `<h2 style="margin:0 0 12px">${escapeHtml(msg.title)}</h2>`,
    `<p><a href="${escapeHtml(msg.permalink)}">${escapeHtml(msg.permalink)}</a></p>`,
    msg.lockLevel != null ? `<p><strong>Lock Level:</strong> ${msg.lockLevel}</p>` : '',
    msg.submittedBy
      ? `<p><strong>Submitted by:</strong> <a href="${escapeHtml(userProfileUrl(msg.submittedBy))}">${escapeHtml(msg.submittedBy)}</a>${escapeHtml(rankSuffix)}</p>`
      : '',
    msg.notes ? `<p><strong>Notes:</strong><br>${escapeHtml(msg.notes).replaceAll('\n', '<br>')}</p>` : '',
    msg.screenshotUrl
      ? `<p><img src="${escapeHtml(msg.screenshotUrl)}" alt="Map viewport screenshot" style="max-width:100%"></p>`
      : '',
  ]
  return parts.filter(Boolean).join('\n')
}

async function sendEmail(
  msg: ReturnType<typeof buildMessage>,
  prefix: string | null,
  toEmail: string,
  emailCredentialId: number | null,
) {
  if (!emailCredentialId) throw new Error('No email credential configured for this channel')
  const credential = await resolveEmailCredential(emailCredentialId)

  const rankSuffix = msg.editorRank != null ? ` (Rank ${msg.editorRank})` : ''
  const lines = bodyLines(msg)
  if (msg.submittedBy) lines.push(`Submitted by: ${msg.submittedBy}${rankSuffix} — ${userProfileUrl(msg.submittedBy)}`)
  const subject = prefix ? `[${prefix}] ${msg.title}` : msg.title

  await dispatchEmail(credential, {
    to: toEmail,
    subject,
    textBody: lines.join('\n'),
    htmlBody: buildEmailHtml(msg, prefix),
  })
}

// Plain structured JSON for arbitrary custom integrations — no platform-specific
// formatting, unlike the Slack/Discord/Telegram senders above.
async function sendWebhook(webhookUrl: string, msg: ReturnType<typeof buildMessage>, prefix: string | null) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: msg.title,
      prefix,
      permalink: msg.permalink,
      lock_level: msg.lockLevel,
      notes: msg.notes,
      submitted_by: msg.submittedBy,
      submitted_by_url: msg.submittedBy ? userProfileUrl(msg.submittedBy) : null,
      editor_rank: msg.editorRank,
      screenshot_url: msg.screenshotUrl,
    }),
  })
}

async function sendGoogleSheet(
  channel: NotificationChannel,
  msg: ReturnType<typeof buildMessage>,
  vars: PrefixVars,
) {
  if (!channel.spreadsheet_id) return
  if (!channel.google_credential_id) throw new Error('No Google service account configured for this channel')
  const credentials = await resolveGoogleCredential(channel.google_credential_id)

  await appendSheetRow(credentials, channel.spreadsheet_id, channel.sheet_name, [
    new Date().toISOString(),
    vars.type,
    vars.country_name,
    vars.country_code,
    vars.region_name,
    vars.region_code,
    msg.permalink,
    msg.lockLevel ?? '',
    msg.editorRank ?? '',
    msg.notes ?? '',
    msg.submittedBy ?? '',
    msg.screenshotUrl ?? '',
  ])
}

async function dispatchChannel(channel: NotificationChannel, msg: ReturnType<typeof buildMessage>, vars: PrefixVars) {
  try {
    const prefix = channel.custom_prefix ? applyPrefixTemplate(channel.custom_prefix, vars) : null
    if (channel.platform === 'slack' && channel.webhook_url) await sendSlack(channel.webhook_url, msg, prefix)
    if (channel.platform === 'discord' && channel.webhook_url)
      await sendDiscord(channel.webhook_url, msg, prefix, !!channel.discord_forum)
    if (channel.platform === 'telegram' && channel.bot_token && channel.chat_id)
      await sendTelegram(channel.bot_token, channel.chat_id, msg, prefix)
    if (channel.platform === 'email' && channel.email_to)
      await sendEmail(msg, prefix, channel.email_to, channel.email_credential_id)
    if (channel.platform === 'webhook' && channel.webhook_url) await sendWebhook(channel.webhook_url, msg, prefix)
    if (channel.platform === 'google_sheets') await sendGoogleSheet(channel, msg, vars)
    return { id: channel.id, ok: true }
  } catch (e) {
    return { id: channel.id, ok: false, error: (e as Error).message }
  }
}

// Region-scoped channels take priority: if the request's region has any channels matching
// this event type, only those fire. Otherwise (no region, or the region has none configured)
// falls back to the country's own (region_id IS NULL) channels — see migrations/0011_regions.sql.
async function audienceChannels(countryId: number, regionId: number | null, requestType: 'downlock' | 'imagery') {
  if (regionId) {
    const regionChannels = await dbAll<NotificationChannel>(
      `SELECT * FROM notification_channels WHERE region_id = ? AND event_type IN ('global', ?)`,
      [regionId, requestType],
    )
    if (regionChannels.length) return regionChannels
  }
  return dbAll<NotificationChannel>(
    `SELECT * FROM notification_channels WHERE country_id = ? AND region_id IS NULL AND event_type IN ('global', ?)`,
    [countryId, requestType],
  )
}

export async function fireNotifications(
  request: RequestRow,
  countryName: string,
  countryCode: string,
  regionName: string | null = null,
  regionCode: string | null = null,
) {
  const channels = await audienceChannels(request.country_id, request.region_id, request.type)
  if (!channels.length) return
  const msg = buildMessage(request, countryName, regionName)
  const vars: PrefixVars = {
    country_code: countryCode,
    country_name: countryName,
    region_code: regionCode || '',
    region_name: regionName || '',
    lock_level: request.lock_level != null ? String(request.lock_level) : '',
    editor_rank: request.editor_rank != null ? String(request.editor_rank) : '',
    type: request.type,
    submitted_by: request.submitted_by || '',
  }
  await Promise.allSettled(channels.map((ch) => dispatchChannel(ch, msg, vars)))
}

export async function sendTestMessage(
  channel: NotificationChannel,
  countryName: string,
  countryCode: string,
  regionName: string | null = null,
  regionCode: string | null = null,
) {
  const vars: PrefixVars = {
    country_code: countryCode,
    country_name: countryName,
    region_code: regionCode || '',
    region_name: regionName || '',
    lock_level: '3',
    editor_rank: '3',
    type: channel.event_type === 'global' ? 'downlock' : channel.event_type,
    submitted_by: 'TestUser',
  }
  return dispatchChannel(
    channel,
    {
      title: `Test Notification — ${channel.label}`,
      color: 0x2ecc71,
      permalink: 'https://www.waze.com/editor',
      lockLevel: null,
      notes: `This is a test message from WME Requests, confirming the "${channel.label}" channel is configured correctly.`,
      submittedBy: null,
      editorRank: null,
      screenshotUrl: null,
    },
    vars,
  )
}
