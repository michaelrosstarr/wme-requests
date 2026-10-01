import { env, waitUntil } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { captcha, twoFactor } from 'better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { withCloudflare } from 'better-auth-cloudflare'
import { renderEmail, sendSystemEmail } from './system-email'
import { securityKey2fa } from './security-key-2fa'
import { securityActivity } from './security-activity'

// Lazy factory: env.DB is only valid inside a request (see getDb() in src/lib/db.ts),
// so auth can't be constructed once at module scope.
export function getAuth() {
  const appOrigin = new URL(env.BETTER_AUTH_URL)
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
        socialProviders: {
          discord: {
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET,
            // Mirrors emailAndPassword's disableSignUp below: "Sign in with Discord" only
            // works for an email that already has a user row (either linking onto it, per
            // the `account` config, or a Discord account already linked to it). It never
            // creates a brand-new account — that stays admin-only via /admin.
            disableImplicitSignUp: true,
          },
        },
        account: {
          accountLinking: {
            enabled: true,
            // Discord's own "email verified" flag is enough to trust the match without
            // also requiring email-verification round-trip on this app's side.
            // When adding a provider, add it here as well as to socialProviders above and to
            // SOCIAL_PROVIDERS in src/lib/social-providers.ts.
            trustedProviders: ['discord'],
            // Admin-created/invited users never go through this app's own email-verification
            // flow (see inviteUser/createUser in src/lib/users.ts), so their `emailVerified`
            // stays unset. Requiring it here would mean Discord could never auto-link onto
            // an existing account, defeating the point.
            requireLocalEmailVerified: false,
            // Lets a signed-in user explicitly link a provider account (from /account) whose
            // email differs from theirs. Implicit linking at sign-in still requires the email
            // match, and disableImplicitSignUp above still blocks sign-up, so this doesn't
            // loosen anything for signed-out users.
            allowDifferentEmails: true,
          },
        },
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
            await sendSystemEmail({
              to: user.email,
              subject: 'Set your WME Requests password',
              ...renderEmail({
                preheader: 'Use this link to set your WME Requests password.',
                heading: 'Set your password',
                paragraphs: [
                  `Hi ${user.name || user.email},`,
                  // Same email for invites and resets (see the comment above), so it reads for both.
                  'Use the button below to set the password for your WME Requests account. If you were just invited, this finishes setting up your account.',
                ],
                button: { label: 'Set my password', url },
                footnote: "If you didn't expect this, you can ignore this email — nothing changes until the link is used.",
              }),
            })
          },
        },
        plugins: [
          // Requires an `x-captcha-response` header carrying the widget token (see the
          // Turnstile component wired into /login and /forgot-password). Its default
          // endpoints — /sign-up/email, /sign-in/email, /request-password-reset — already
          // cover both, even though sign-up itself stays disabled above.
          captcha({ provider: 'cloudflare-turnstile', secretKey: env.TURNSTILE_SECRET_KEY }),
          // Passkey sign-in isn't behind captcha: WebAuthn is origin-bound and phishing-resistant
          // on its own. rpID is the bare hostname (`localhost` in dev, which WebAuthn allows).
          passkey({ rpID: appOrigin.hostname, rpName: 'WME Requests', origin: appOrigin.origin }),
          // Two-factor authentication. Only password sign-in (/sign-in/email) is challenged —
          // passkeys are already multi-factor, and Discord relies on the Discord account's own
          // security. Email codes work for every user with 2FA on (that's how it gets turned on,
          // see /account); the authenticator app is optional on top, plus one-time backup codes.
          twoFactor({
            issuer: 'WME Requests',
            otpOptions: {
              storeOTP: 'hashed',
              sendOTP: async ({ user, otp }) => {
                await sendSystemEmail({
                  to: user.email,
                  subject: `${otp} is your WME Requests verification code`,
                  ...renderEmail({
                    preheader: `Your WME Requests sign-in code is ${otp}.`,
                    heading: 'Your sign-in code',
                    paragraphs: ['Enter this code to finish signing in to WME Requests. It expires in 3 minutes.'],
                    code: otp,
                    footnote: "If you didn't just try to sign in, someone may know your password — change it right away.",
                  }),
                })
              },
            },
          }),
          // Physical security keys as another second factor — must come after twoFactor().
          securityKey2fa({ rpID: appOrigin.hostname, rpName: 'WME Requests', origin: appOrigin.origin }),
          // Security log + notification emails. Must come after the two-factor plugins (see file).
          securityActivity(),
          // Cookie-setting plugin for TanStack Start must come last.
          tanstackStartCookies(),
        ],
      },
    ),
  })
}
