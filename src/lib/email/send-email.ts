import { sendViaPostmark } from './postmark'
import { sendViaMailgun } from './mailgun'
import { sendViaSmtp } from './smtp'
import type { EmailCredentialPayload, SendEmailOptions } from './types'

export async function sendEmail(credential: EmailCredentialPayload, opts: SendEmailOptions) {
  if (credential.provider === 'postmark') return sendViaPostmark(credential.serverToken, credential.fromEmail, opts)
  if (credential.provider === 'mailgun')
    return sendViaMailgun(credential.apiKey, credential.domain, credential.fromEmail, opts)
  return sendViaSmtp(credential, opts)
}

export type { EmailCredentialPayload, SendEmailOptions }
