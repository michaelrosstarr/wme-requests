export type EmailCredentialPayload =
  | { provider: 'postmark'; serverToken: string; fromEmail: string }
  | { provider: 'mailgun'; apiKey: string; domain: string; fromEmail: string }
  | { provider: 'smtp'; host: string; port: number; secure: boolean; username: string; password: string; fromEmail: string }

export interface SendEmailOptions {
  to: string
  subject: string
  textBody: string
  htmlBody: string
}
