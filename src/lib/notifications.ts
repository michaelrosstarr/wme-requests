import { env } from 'cloudflare:workers'
import { dbAll } from './db'

export interface NotificationChannel {
  id: number
  country_id: number
  label: string
  platform: 'slack' | 'discord' | 'telegram' | 'email' | 'webhook'
  event_type: 'global' | 'downlock' | 'imagery'
  webhook_url: string | null
  bot_token: string | null
  chat_id: string | null
  custom_prefix: string | null
  email_to: string | null
}

export interface RequestRow {
  id: number
  country_id: number
  type: 'downlock' | 'imagery'
  permalink: string
  lock_level: number | null
  editor_rank: number | null
  notes: string | null
  submitted_by: string | null
}

function userProfileUrl(username: string) {
  return `https://www.waze.com/user/editor/${encodeURIComponent(username)}`
}

// Variables available inside a channel's custom_prefix template, e.g. "L{lock_level}{country_code}".
type PrefixVars = Record<string, string>

function applyPrefixTemplate(template: string, vars: PrefixVars) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match)
}

function buildMessage(request: RequestRow, countryName: string) {
  const typeLabel = request.type === 'downlock' ? 'Downlock Request' : 'Imagery Request'
  const title = `${typeLabel} — ${countryName}`
  const color = request.type === 'downlock' ? 0xe74c3c : 0x3498db
  return {
    title,
    color,
    permalink: request.permalink,
    lockLevel: request.type === 'downlock' ? request.lock_level : null,
    notes: request.notes,
    submittedBy: request.submitted_by,
    editorRank: request.editor_rank,
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

async function sendDiscord(webhookUrl: string, msg: ReturnType<typeof buildMessage>, prefix: string | null) {
  const rankSuffix = msg.editorRank != null ? ` (Rank ${msg.editorRank})` : ''
  const lines = bodyLines(msg)
  if (msg.submittedBy) lines.push(`Submitted by: [${msg.submittedBy}](${userProfileUrl(msg.submittedBy)})${rankSuffix}`)
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: prefix || undefined,
      embeds: [{ title: msg.title, description: lines.join('\n'), color: msg.color, timestamp: new Date().toISOString() }],
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
  ]
  return parts.filter(Boolean).join('\n')
}

// Sent via Postmark's single-email API (https://postmarkapp.com/developer/api/email-api).
// POSTMARK_FROM_EMAIL must be a verified Sender Signature/domain in the Postmark account;
// POSTMARK_SERVER_TOKEN is the Server API Token, set as a Worker secret (never in wrangler.jsonc).
async function sendEmail(msg: ReturnType<typeof buildMessage>, prefix: string | null, toEmail: string) {
  const rankSuffix = msg.editorRank != null ? ` (Rank ${msg.editorRank})` : ''
  const lines = bodyLines(msg)
  if (msg.submittedBy) lines.push(`Submitted by: ${msg.submittedBy}${rankSuffix} — ${userProfileUrl(msg.submittedBy)}`)
  const subject = prefix ? `[${prefix}] ${msg.title}` : msg.title

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: env.POSTMARK_FROM_EMAIL,
      To: toEmail,
      Subject: subject,
      TextBody: lines.join('\n'),
      HtmlBody: buildEmailHtml(msg, prefix),
    }),
  })
  if (!res.ok) throw new Error(`Postmark error ${res.status}: ${await res.text()}`)
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
    }),
  })
}

async function dispatchChannel(channel: NotificationChannel, msg: ReturnType<typeof buildMessage>, vars: PrefixVars) {
  try {
    const prefix = channel.custom_prefix ? applyPrefixTemplate(channel.custom_prefix, vars) : null
    if (channel.platform === 'slack' && channel.webhook_url) await sendSlack(channel.webhook_url, msg, prefix)
    if (channel.platform === 'discord' && channel.webhook_url) await sendDiscord(channel.webhook_url, msg, prefix)
    if (channel.platform === 'telegram' && channel.bot_token && channel.chat_id)
      await sendTelegram(channel.bot_token, channel.chat_id, msg, prefix)
    if (channel.platform === 'email' && channel.email_to) await sendEmail(msg, prefix, channel.email_to)
    if (channel.platform === 'webhook' && channel.webhook_url) await sendWebhook(channel.webhook_url, msg, prefix)
    return { id: channel.id, ok: true }
  } catch (e) {
    return { id: channel.id, ok: false, error: (e as Error).message }
  }
}

export async function fireNotifications(request: RequestRow, countryName: string, countryCode: string) {
  const channels = await dbAll<NotificationChannel>(
    `SELECT * FROM notification_channels WHERE country_id = ? AND event_type IN ('global', ?)`,
    [request.country_id, request.type],
  )
  if (!channels.length) return
  const msg = buildMessage(request, countryName)
  const vars: PrefixVars = {
    country_code: countryCode,
    country_name: countryName,
    lock_level: request.lock_level != null ? String(request.lock_level) : '',
    editor_rank: request.editor_rank != null ? String(request.editor_rank) : '',
    type: request.type,
    submitted_by: request.submitted_by || '',
  }
  await Promise.allSettled(channels.map((ch) => dispatchChannel(ch, msg, vars)))
}

export async function sendTestMessage(channel: NotificationChannel, countryName: string, countryCode: string) {
  const vars: PrefixVars = {
    country_code: countryCode,
    country_name: countryName,
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
    },
    vars,
  )
}
