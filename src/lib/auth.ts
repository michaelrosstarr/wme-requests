import { env, waitUntil } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { withCloudflare } from 'better-auth-cloudflare'
import { sendPostmarkEmail } from './postmark'

// Lazy factory: env.DB is only valid inside a request (see getDb() in src/lib/db.ts),
// so auth can't be constructed once at module scope.
export function getAuth() {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    // Needed so password-reset/invite emails link back to an absolute URL — without it,
    // Better Auth only resolves an origin from the incoming request, which direct
    // server-side calls (e.g. an admin inviting another user) don't have.
    baseURL: env.BETTER_AUTH_URL,
    advanced: { backgroundTasks: { handler: (p) => waitUntil(p) } },
    ...withCloudflare(
      { d1Native: env.DB, autoDetectIpAddress: false, geolocationTracking: false },
      {
        emailAndPassword: {
          enabled: true,
          // No public sign-up UI is linked in the dashboard; the first admin account
          // is created out-of-band (see README). Disabling sign-up here means the
          // endpoint itself refuses new accounts, not just the missing UI link. Admins
          // provision further accounts from /admin (src/lib/users.ts) instead.
          disableSignUp: true,
          // Also doubles as the "invite" email: an invited user has a `user` row but no
          // `account` row yet, and this same reset-password flow creates one for them
          // once they follow the link and set a password (see api/routes/password.mjs).
          sendResetPassword: async ({ user, url }) => {
            await sendPostmarkEmail({
              to: user.email,
              subject: 'Set your WME Requests password',
              textBody: `Set your password for WME Requests:\n\n${url}\n\nIf you didn't request this, you can ignore this email.`,
              htmlBody: `<p>Set your password for WME Requests:</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
            })
          },
        },
        // Cookie-setting plugin for TanStack Start must come last.
        plugins: [tanstackStartCookies()],
      },
    ),
  })
}
