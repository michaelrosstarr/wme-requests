import type { SendEmailOptions } from './types'

// Sent via Mailgun's messages API (https://documentation.mailgun.com/en/latest/api-sending.html#sending),
// which — unlike every other sender in this codebase — takes a form-encoded body, not JSON.
export async function sendViaMailgun(apiKey: string, domain: string, fromEmail: string, opts: SendEmailOptions) {
  const body = new URLSearchParams({
    from: fromEmail,
    to: opts.to,
    subject: opts.subject,
    text: opts.textBody,
    html: opts.htmlBody,
  })
  const res = await fetch(`https://api.mailgun.net/v3/${encodeURIComponent(domain)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) throw new Error(`Mailgun error ${res.status}: ${await res.text()}`)
}
