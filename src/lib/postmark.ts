import { env } from 'cloudflare:workers'

// Sent via Postmark's single-email API (https://postmarkapp.com/developer/api/email-api).
// POSTMARK_FROM_EMAIL must be a verified Sender Signature/domain in the Postmark account;
// POSTMARK_SERVER_TOKEN is the Server API Token, set as a Worker secret (never in wrangler.jsonc).
export async function sendPostmarkEmail(opts: { to: string; subject: string; textBody: string; htmlBody: string }) {
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: env.POSTMARK_FROM_EMAIL,
      To: opts.to,
      Subject: opts.subject,
      TextBody: opts.textBody,
      HtmlBody: opts.htmlBody,
    }),
  })
  if (!res.ok) throw new Error(`Postmark error ${res.status}: ${await res.text()}`)
}
