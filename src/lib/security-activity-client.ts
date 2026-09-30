import type { BetterAuthClientPlugin } from 'better-auth/client'
import type { securityActivity } from './security-activity'

// Infers authClient.securityActivity() (GET /security-activity) from the server plugin.
export const securityActivityClient = () =>
  ({
    id: 'security-activity',
    $InferServerPlugin: {} as ReturnType<typeof securityActivity>,
  }) satisfies BetterAuthClientPlugin
