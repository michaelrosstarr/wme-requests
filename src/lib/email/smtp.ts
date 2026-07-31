import { WorkerMailer } from 'worker-mailer'
import type { SendEmailOptions } from './types'

// worker-mailer is a zero-dependency SMTP client built on Workers' `cloudflare:sockets` TCP
// API — no Node net/tls, so no nodemailer here.
export async function sendViaSmtp(
  config: { host: string; port: number; secure: boolean; username: string; password: string; fromEmail: string },
  opts: SendEmailOptions,
) {
  await WorkerMailer.send(
    {
      host: config.host,
      port: config.port,
      secure: config.secure,
      credentials: { username: config.username, password: config.password },
      authType: ['plain', 'login'],
    },
    {
      from: config.fromEmail,
      to: opts.to,
      subject: opts.subject,
      text: opts.textBody,
      html: opts.htmlBody,
    },
  )
}
