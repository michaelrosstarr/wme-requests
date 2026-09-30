import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
import { securityKey2faClient } from './security-key-2fa-client'
import { securityActivityClient } from './security-activity-client'

export const authClient = createAuthClient({
  plugins: [passkeyClient(), twoFactorClient(), securityKey2faClient(), securityActivityClient()],
})
