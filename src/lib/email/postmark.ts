import type { SendEmailOptions } from './types'

// Sent via Postmark's single-email API (https://postmarkapp.com/developer/api/email-api).
// `fromEmail` must be a verified Sender Signature/domain in the credential owner's Postmark account.
export async function sendViaPostmark(serverToken: string, fromEmail: string, opts: SendEmailOptions) {
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': serverToken,
    },
    body: JSON.stringify({
      From: fromEmail,
      To: opts.to,
      Subject: opts.subject,
      TextBody: opts.textBody,
      HtmlBody: opts.htmlBody,
    }),
  })
  if (!res.ok) throw new Error(`Postmark error ${res.status}: ${await res.text()}`)
}
