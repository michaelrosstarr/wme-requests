import type { BetterAuthPlugin } from 'better-auth'
import type { GenericEndpointContext } from '@better-auth/core'
import { APIError, createAuthEndpoint, sensitiveSessionMiddleware, sessionMiddleware } from 'better-auth/api'
import { expireCookie, setSessionCookie } from 'better-auth/cookies'
import { generateRandomString } from 'better-auth/crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import * as z from 'zod'

// Physical security keys (YubiKey, Titan, …) as a *second* factor, alongside Better Auth's own
// two-factor plugin (email codes, authenticator app, backup codes). Better Auth's two-factor plugin
// has no WebAuthn factor, and its passkey plugin is a *first* factor (it signs you in on its own),
// so this is a small separate plugin that hooks into the same pending-2FA state:
//
// - Password sign-in for a user with 2FA on sets the two-factor plugin's signed `two_factor` cookie,
//   pointing at a verification row whose value is the user id. The endpoints below read that same
//   cookie, verify a WebAuthn assertion from one of the user's registered keys, then finish the
//   sign-in exactly the way the two-factor plugin's own verify endpoints do (consume the row, create
//   the session, clear the cookie, optionally trust the device).
// - Keys are registered as non-discoverable credentials without user verification — the classic
//   "touch your key" second factor, not a passkey — and live in their own `securityKey` table so
//   they can never be used to sign in without the password.
//
// Must be registered after twoFactor() in src/lib/auth.ts, since it relies on its cookies and table.

// Mirrors better-auth/dist/plugins/two-factor/constant.mjs (not exported publicly).
const TWO_FACTOR_COOKIE_NAME = 'two_factor'
const TRUST_DEVICE_COOKIE_NAME = 'trust_device'
const DEFAULT_TRUST_DEVICE_MAX_AGE = 30 * 24 * 60 * 60
const CHALLENGE_TTL_MS = 5 * 60 * 1000

interface SecurityKeyRow {
  id: string
  name: string | null
  publicKey: string
  userId: string
  credentialID: string
  counter: number
  transports: string | null
  createdAt: Date
}

interface TwoFactorRow {
  id: string
  userId: string
  verified: boolean | null
}

export interface SecurityKey2faOptions {
  rpID: string
  rpName: string
  origin: string
}

const err = (status: 'BAD_REQUEST' | 'UNAUTHORIZED', code: string, message: string) =>
  new APIError(status, { code, message })

function parseTransports(transports: string | null) {
  return transports ? (transports.split(',') as AuthenticatorTransportFuture[]) : undefined
}

// Same token format the two-factor plugin checks on the next sign-in:
// createHMAC('SHA-256', 'base64urlnopad').sign(secret, `${userId}!${trustIdentifier}`).
async function signTrustToken(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return isoBase64URL.fromBuffer(new Uint8Array(sig))
}

export function securityKey2fa(options: SecurityKey2faOptions) {
  const { rpID, rpName, origin } = options

  return {
    id: 'security-key-2fa',
    schema: {
      securityKey: {
        fields: {
          name: { type: 'string', required: false },
          publicKey: { type: 'string', required: true },
          userId: { type: 'string', required: true, references: { model: 'user', field: 'id' }, index: true },
          credentialID: { type: 'string', required: true, index: true },
          counter: { type: 'number', required: true },
          transports: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
        },
      },
    },
    endpoints: {
      // Status for the Account page: whether 2FA is on, and whether the authenticator app is
      // actually set up (the two-factor plugin keeps an unverified TOTP secret for email-only users).
      twoFactorStatus: createAuthEndpoint(
        '/two-factor-status',
        { method: 'GET', use: [sessionMiddleware] },
        async (ctx) => {
          const user = ctx.context.session.user as { id: string; twoFactorEnabled?: boolean | null }
          const row = await ctx.context.adapter.findOne<TwoFactorRow>({
            model: 'twoFactor',
            where: [{ field: 'userId', value: user.id }],
          })
          const enabled = !!user.twoFactorEnabled
          return ctx.json({ enabled, totp: enabled && !!row && row.verified !== false })
        },
      ),

      listSecurityKeys: createAuthEndpoint(
        '/security-key/list',
        { method: 'GET', use: [sessionMiddleware] },
        async (ctx) => {
          const keys = await ctx.context.adapter.findMany<SecurityKeyRow>({
            model: 'securityKey',
            where: [{ field: 'userId', value: ctx.context.session.user.id }],
          })
          return ctx.json(keys.map((k) => ({ id: k.id, name: k.name, createdAt: k.createdAt })))
        },
      ),

      deleteSecurityKey: createAuthEndpoint(
        '/security-key/delete',
        { method: 'POST', body: z.object({ id: z.string() }), use: [sensitiveSessionMiddleware] },
        async (ctx) => {
          await ctx.context.adapter.delete({
            model: 'securityKey',
            where: [
              { field: 'id', value: ctx.body.id },
              { field: 'userId', value: ctx.context.session.user.id },
            ],
          })
          return ctx.json({ status: true })
        },
      ),

      generateSecurityKeyRegisterOptions: createAuthEndpoint(
        '/security-key/generate-register-options',
        { method: 'GET', use: [sessionMiddleware] },
        async (ctx) => {
          const { user, session } = ctx.context.session
          // Keys only ever act as a second factor, so there's nothing for them to do until 2FA is on.
          if (!(user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) {
            throw err('BAD_REQUEST', 'TWO_FACTOR_NOT_ENABLED', 'Turn on two-factor authentication first')
          }
          const existing = await ctx.context.adapter.findMany<SecurityKeyRow>({
            model: 'securityKey',
            where: [{ field: 'userId', value: user.id }],
          })
          const opts = await generateRegistrationOptions({
            rpName,
            rpID,
            userName: user.email,
            userDisplayName: user.name || user.email,
            attestationType: 'none',
            excludeCredentials: existing.map((k) => ({
              id: k.credentialID,
              transports: parseTransports(k.transports),
            })),
            authenticatorSelection: { residentKey: 'discouraged', userVerification: 'discouraged' },
            // Nudges browsers to prompt for a roaming key rather than the platform authenticator.
            preferredAuthenticatorType: 'securityKey',
          })
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `security-key-reg-${session.id}`,
            value: opts.challenge,
            expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
          })
          return ctx.json(opts)
        },
      ),

      verifySecurityKeyRegistration: createAuthEndpoint(
        '/security-key/verify-registration',
        {
          method: 'POST',
          body: z.object({ response: z.any(), name: z.string().max(100).optional() }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const { user, session } = ctx.context.session
          const challenge = await ctx.context.internalAdapter.consumeVerificationValue(`security-key-reg-${session.id}`)
          if (!challenge || challenge.expiresAt < new Date()) {
            throw err('BAD_REQUEST', 'CHALLENGE_NOT_FOUND', 'Registration expired — please try again')
          }
          let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
          try {
            verification = await verifyRegistrationResponse({
              response: ctx.body.response,
              expectedChallenge: challenge.value,
              expectedOrigin: origin,
              expectedRPID: rpID,
              requireUserVerification: false,
            })
          } catch (e) {
            ctx.context.logger.error('Failed to verify security key registration', e)
            throw err('BAD_REQUEST', 'FAILED_TO_VERIFY_REGISTRATION', 'Could not verify the security key')
          }
          if (!verification.verified || !verification.registrationInfo) {
            throw err('BAD_REQUEST', 'FAILED_TO_VERIFY_REGISTRATION', 'Could not verify the security key')
          }
          const { credential } = verification.registrationInfo
          const created = await ctx.context.adapter.create<Omit<SecurityKeyRow, 'id'>, SecurityKeyRow>({
            model: 'securityKey',
            data: {
              name: ctx.body.name?.trim() || null,
              publicKey: isoBase64URL.fromBuffer(credential.publicKey),
              userId: user.id,
              credentialID: credential.id,
              counter: credential.counter,
              transports: credential.transports?.join(',') ?? null,
              createdAt: new Date(),
            },
          })
          return ctx.json({ id: created.id, name: created.name, createdAt: created.createdAt })
        },
      ),

      // Sign-in: the pending-2FA user comes from the two-factor plugin's cookie, not a session.
      // Also doubles as the "does this user have any keys?" check for the login page.
      generateSecurityKeyAuthenticateOptions: createAuthEndpoint(
        '/security-key/generate-authenticate-options',
        { method: 'POST' },
        async (ctx) => {
          const pending = await getPendingTwoFactor(ctx)
          const keys = await ctx.context.adapter.findMany<SecurityKeyRow>({
            model: 'securityKey',
            where: [{ field: 'userId', value: pending.userId }],
          })
          if (!keys.length) throw err('BAD_REQUEST', 'NO_SECURITY_KEYS', 'No security keys registered')
          const opts = await generateAuthenticationOptions({
            rpID,
            userVerification: 'discouraged',
            allowCredentials: keys.map((k) => ({ id: k.credentialID, transports: parseTransports(k.transports) })),
          })
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `security-key-auth-${pending.identifier}`,
            value: opts.challenge,
            expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
          })
          return ctx.json(opts)
        },
      ),

      verifySecurityKeyAuthentication: createAuthEndpoint(
        '/security-key/verify-authentication',
        { method: 'POST', body: z.object({ response: z.any(), trustDevice: z.boolean().optional() }) },
        async (ctx) => {
          const pending = await getPendingTwoFactor(ctx)
          const challenge = await ctx.context.internalAdapter.consumeVerificationValue(
            `security-key-auth-${pending.identifier}`,
          )
          if (!challenge || challenge.expiresAt < new Date()) {
            throw err('BAD_REQUEST', 'CHALLENGE_NOT_FOUND', 'Security key check expired — please try again')
          }
          const key = await ctx.context.adapter.findOne<SecurityKeyRow>({
            model: 'securityKey',
            where: [
              { field: 'credentialID', value: String(ctx.body.response?.id ?? '') },
              { field: 'userId', value: pending.userId },
            ],
          })
          if (!key)
            throw err('UNAUTHORIZED', 'SECURITY_KEY_NOT_FOUND', 'That security key is not registered to this account')

          let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
          try {
            verification = await verifyAuthenticationResponse({
              response: ctx.body.response,
              expectedChallenge: challenge.value,
              expectedOrigin: origin,
              expectedRPID: rpID,
              credential: {
                id: key.credentialID,
                publicKey: isoBase64URL.toBuffer(key.publicKey),
                counter: key.counter,
                transports: parseTransports(key.transports),
              },
              requireUserVerification: false,
            })
          } catch (e) {
            ctx.context.logger.error('Failed to verify security key authentication', e)
            throw err('UNAUTHORIZED', 'AUTHENTICATION_FAILED', 'Security key verification failed')
          }
          if (!verification.verified)
            throw err('UNAUTHORIZED', 'AUTHENTICATION_FAILED', 'Security key verification failed')

          await ctx.context.adapter.update({
            model: 'securityKey',
            where: [{ field: 'id', value: key.id }],
            update: { counter: verification.authenticationInfo.newCounter },
          })

          // From here on, mirrors the two-factor plugin's verifyTwoFactor().valid().
          const consumed = await ctx.context.internalAdapter.consumeVerificationValue(pending.identifier)
          if (!consumed || consumed.value !== pending.userId) {
            expireCookie(ctx, pending.cookie)
            throw err('UNAUTHORIZED', 'INVALID_TWO_FACTOR_COOKIE', 'Sign-in expired — please sign in again')
          }
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(`2fa-attempts-${pending.identifier}`)
          const dontRememberMe = await ctx.getSignedCookie(
            ctx.context.authCookies.dontRememberToken.name,
            ctx.context.secret,
          )
          const session = await ctx.context.internalAdapter.createSession(pending.user.id, !!dontRememberMe)
          if (!session) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to create session' })
          await setSessionCookie(ctx, { session, user: pending.user })
          expireCookie(ctx, pending.cookie)

          if (ctx.body.trustDevice) {
            const maxAge =
              (ctx.context.getPlugin('two-factor')?.options as { trustDeviceMaxAge?: number } | undefined)
                ?.trustDeviceMaxAge ?? DEFAULT_TRUST_DEVICE_MAX_AGE
            const trustCookie = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE_NAME, { maxAge })
            const trustIdentifier = `trust-device-${generateRandomString(32)}`
            const token = await signTrustToken(ctx.context.secret, `${pending.user.id}!${trustIdentifier}`)
            await ctx.context.internalAdapter.createVerificationValue({
              value: pending.user.id,
              identifier: trustIdentifier,
              expiresAt: new Date(Date.now() + maxAge * 1000),
            })
            await ctx.setSignedCookie(
              trustCookie.name,
              `${token}!${trustIdentifier}`,
              ctx.context.secret,
              trustCookie.attributes,
            )
            expireCookie(ctx, ctx.context.authCookies.dontRememberToken)
          }

          return ctx.json({
            token: session.token,
            user: { id: pending.user.id, email: pending.user.email, name: pending.user.name },
          })
        },
      ),
    },
    rateLimit: [{ pathMatcher: (path) => path.startsWith('/security-key/'), window: 60, max: 20 }],
  } satisfies BetterAuthPlugin
}

async function getPendingTwoFactor(ctx: GenericEndpointContext) {
  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME)
  const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
  const invalid = () => err('UNAUTHORIZED', 'INVALID_TWO_FACTOR_COOKIE', 'Sign-in expired — please sign in again')
  if (!identifier) throw invalid()
  const verification = await ctx.context.internalAdapter.findVerificationValue(identifier)
  if (!verification || verification.expiresAt < new Date()) throw invalid()
  const user = await ctx.context.internalAdapter.findUserById(verification.value)
  if (!user) throw invalid()
  return { identifier, userId: user.id, user, cookie }
}
