import { env } from 'cloudflare:workers'

// Auth/system emails (password reset, invites, 2FA codes), sent through the Cloudflare Email
// Sending binding (`send_email` in wrangler.jsonc). Unrelated to the `email` notification
// platform, which sends through each channel's own credential (src/lib/email/).
export async function sendSystemEmail(opts: { to: string; subject: string; text: string; html: string }) {
  await env.EMAIL.send({
    to: opts.to,
    from: { email: env.AUTH_EMAIL_FROM, name: 'WME Requests' },
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  })
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export interface EmailContent {
  /** Hidden preview line shown next to the subject in most inboxes. */
  preheader: string
  heading: string
  /** Plain-text paragraphs (escaped). */
  paragraphs: string[]
  /** Primary call-to-action button. Its URL is also printed below it as a fallback link. */
  button?: { label: string; url: string }
  /** A one-time code, shown large and spaced out. */
  code?: string
  /** Label/value rows, e.g. when/where/device on security alerts. */
  rows?: [string, string][]
  /** Small print after the main content. */
  footnote?: string
}

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
const C = {
  page: '#eef3f7',
  card: '#ffffff',
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  button: '#1d72d8',
  codeBg: '#f1f6fb',
}

/**
 * Renders the shared WME Requests email layout (banner, heading, body, optional button/code/rows,
 * footer) as both HTML and plain text. The HTML is table-based with inline styles, the only
 * thing that renders consistently across Gmail, Outlook and Apple Mail.
 */
export function renderEmail(content: EmailContent): { text: string; html: string } {
  const origin = new URL(env.BETTER_AUTH_URL).origin
  const banner = `${origin}/email-banner.png`
  const p = (html: string, style = '') =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${C.text};${style}">${html}</p>`

  const parts: string[] = [
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:${C.text};">${escapeHtml(content.heading)}</h1>`,
    ...content.paragraphs.map((t) => p(escapeHtml(t))),
  ]

  if (content.rows?.length) {
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px;border:1px solid ${C.border};border-radius:8px;border-collapse:separate;">
        ${content.rows
          .map(
            ([k, v], i) =>
              `<tr><td style="padding:10px 14px;font-size:13px;color:${C.muted};white-space:nowrap;vertical-align:top;${i ? `border-top:1px solid ${C.border};` : ''}">${escapeHtml(k)}</td><td style="padding:10px 14px;font-size:14px;color:${C.text};word-break:break-word;${i ? `border-top:1px solid ${C.border};` : ''}">${escapeHtml(v)}</td></tr>`,
          )
          .join('')}
      </table>`,
    )
  }

  if (content.code) {
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
        <td style="background:${C.codeBg};border:1px solid ${C.border};border-radius:8px;padding:14px 24px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${C.text};">${escapeHtml(content.code)}</td>
      </tr></table>`,
    )
  }

  if (content.button) {
    const url = escapeHtml(content.button.url)
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
        <td style="border-radius:8px;background:${C.button};">
          <a href="${url}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(content.button.label)}</a>
        </td>
      </tr></table>`,
      p(
        `Button not working? Paste this link into your browser:<br><a href="${url}" style="color:${C.button};word-break:break-all;">${url}</a>`,
        `font-size:13px;line-height:20px;color:${C.muted};`,
      ),
    )
  }

  if (content.footnote) parts.push(p(escapeHtml(content.footnote), `font-size:13px;line-height:20px;color:${C.muted};`))

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border-radius:12px;overflow:hidden;border:1px solid ${C.border};">
      <tr><td style="padding:0;line-height:0;font-size:0;">
        <a href="${origin}" target="_blank"><img src="${banner}" width="600" height="200" alt="wazetools.com" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a>
      </td></tr>
      <tr><td style="padding:32px 32px 16px;font-family:${FONT};">
        ${parts.join('\n        ')}
      </td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid ${C.border};font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
        <strong style="color:${C.text};">WME Requests</strong> — lock, imagery and place update requests for Waze Map Editor.<br>
        <a href="${origin}" style="color:${C.muted};">${escapeHtml(new URL(origin).host)}</a> · An independent tool, not affiliated with Waze or Google.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

  const text = [
    content.heading,
    '',
    ...content.paragraphs.flatMap((t) => [t, '']),
    ...(content.rows?.length ? [...content.rows.map(([k, v]) => `${k}: ${v}`), ''] : []),
    ...(content.code ? [content.code, ''] : []),
    ...(content.button ? [`${content.button.label}: ${content.button.url}`, ''] : []),
    ...(content.footnote ? [content.footnote, ''] : []),
    '—',
    `WME Requests · ${origin}`,
  ].join('\n')

  return { text, html }
}
