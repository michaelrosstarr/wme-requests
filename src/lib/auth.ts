import { env, waitUntil } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { withCloudflare } from 'better-auth-cloudflare'

// Lazy factory: env.DB is only valid inside a request (see getDb() in src/lib/db.ts),
// so auth can't be constructed once at module scope.
export function getAuth() {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    advanced: { backgroundTasks: { handler: (p) => waitUntil(p) } },
    ...withCloudflare(
      { d1Native: env.DB, autoDetectIpAddress: false, geolocationTracking: false },
      {
        emailAndPassword: {
          enabled: true,
          // No public sign-up UI is linked in the dashboard; the first admin account
          // is created out-of-band (see README). Disabling sign-up here means the
          // endpoint itself refuses new accounts, not just the missing UI link.
          disableSignUp: true,
        },
        // Cookie-setting plugin for TanStack Start must come last.
        plugins: [tanstackStartCookies()],
      },
    ),
  })
}
