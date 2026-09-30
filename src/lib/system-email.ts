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
