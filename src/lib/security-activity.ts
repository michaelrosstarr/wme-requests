import { env, waitUntil } from 'cloudflare:workers'
import type { BetterAuthPlugin } from 'better-auth'
import type { GenericEndpointContext } from '@better-auth/core'
import {
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
  sessionMiddleware,
} from 'better-auth/api'
import { dbAll, dbFirst, dbRun } from './db'
import { renderEmail, sendSystemEmail } from './system-email'
import { SOCIAL_PROVIDERS } from './social-providers'
import {
  SECURITY_EVENTS,
  type SecurityEventDetail,
  type SecurityEventRow,
  type SecurityEventType,
} from './security-events'

// Account security log + "was this you?" emails.
//
// Every security-relevant change to an account is written to `security_events` (shown on the
// Account page, and echoed to Workers Logs), and the ones marked `notify` in
// src/lib/security-events.ts also email the user. Sign-ins and failed sign-ins are logged but
// never emailed.
//
// Most events come from Better Auth endpoints, so they're detected with hooks rather than by
// editing each endpoint: a `before` hook snapshots whatever the `after` hook will need but can't
// see any more once the endpoint has run (the signed-in user before a 2FA change rotates their
// session, a passkey's name before it's deleted, …), keyed by the incoming Request. Account
// linking happens deep inside the OAuth callback, so that one uses a database hook instead.
//
// Must be registered after twoFactor() and securityKey2fa() in src/lib/auth.ts: two-factor's
// own after-hook clears `newSession` when a password sign-in still needs a second factor, and
// this plugin relies on seeing that to avoid logging half-finished sign-ins.

const MAX_EVENTS_PER_USER = 200

interface Actor {
  id: string
  email: string
  name?: string | null
}

interface Snapshot {
  user: Actor | null
  /** User waiting on a second factor (from the two-factor plugin's cookie), if any. */
  pendingUserId?: string
  twoFactorEnabled?: boolean
  totp?: boolean
  /** Name of the passkey / security key about to be deleted. */
  itemName?: string | null
  /** Target of a password reset (resolved from the reset token before it's consumed). */
  resetUserId?: string
}

const SIGN_IN_METHODS: Record<string, string> = {
  '/sign-in/email': 'password',
  '/passkey/verify-authentication': 'passkey',
  '/two-factor/verify-totp': 'password + authenticator app',
  '/two-factor/verify-otp': 'password + email code',
  '/two-factor/verify-backup-code': 'password + backup code',
  '/security-key/verify-authentication': 'password + security key',
}

const SNAPSHOT_PATHS = new Set([
  '/passkey/verify-registration',
  '/passkey/delete-passkey',
  '/security-key/verify-registration',
  '/security-key/delete',
  '/security-key/verify-authentication',
  '/unlink-account',
  '/change-password',
  '/reset-password',
])

function providerLabel(id: string | undefined) {
  return SOCIAL_PROVIDERS.find((p) => p.id === id)?.label ?? id ?? 'Unknown provider'
}

function requestInfo(headers: Headers | null | undefined) {
  return {
    ip: headers?.get('cf-connecting-ip') ?? headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    country: headers?.get('cf-ipcountry') ?? null,
    userAgent: headers?.get('user-agent')?.slice(0, 300) ?? null,
  }
}

function summarize(event: SecurityEventType, detail: SecurityEventDetail) {
  const name = detail.name ? ` ("${detail.name}")` : ''
  switch (event) {
    case 'password_changed':
      return 'Your password was changed'
    case 'passkey_added':
      return `A passkey${name} was added to your account`
    case 'passkey_removed':
      return `A passkey${name} was removed from your account`
    case 'two_factor_enabled':
      return 'Two-factor authentication was turned on'
    case 'two_factor_disabled':
      return 'Two-factor authentication was turned off'
    case 'totp_enabled':
      return 'An authenticator app was added for two-factor authentication'
    case 'backup_codes_regenerated':
      return 'New two-factor backup codes were generated (your old ones no longer work)'
    case 'security_key_added':
      return `A security key${name} was added to your account`
    case 'security_key_removed':
      return `A security key${name} was removed from your account`
    case 'account_linked':
      return `Your ${providerLabel(detail.provider)} account was connected`
    case 'account_unlinked':
      return `Your ${providerLabel(detail.provider)} account was disconnected`
    default:
      return SECURITY_EVENTS[event].label
  }
}

async function sendSecurityEmail(
  user: Actor,
  event: SecurityEventType,
  detail: SecurityEventDetail,
  info: ReturnType<typeof requestInfo>,
) {
  const summary = summarize(event, detail)
  const base = new URL(env.BETTER_AUTH_URL).origin
  const when = new Date().toUTCString()
  const where = [info.ip, info.country && `(${info.country})`].filter(Boolean).join(' ') || 'Unknown'
  const device = info.userAgent ?? 'Unknown'
  const rows: [string, string][] = [
    ['When', when],
    ['IP address', where],
    ['Device', device],
  ]
  await sendSystemEmail({
    to: user.email,
    subject: `Security alert: ${summary}`,
    ...renderEmail({
      preheader: `${summary}. If this wasn't you, secure your account.`,
      heading: 'Security alert',
      paragraphs: [`Hi ${user.name || user.email},`, `${summary} on your WME Requests account.`],
      rows,
      button: { label: 'Review account security', url: `${base}/account` },
      footnote: `If this was you, you don't need to do anything. If it wasn't, reset your password right away at ${base}/forgot-password.`,
    }),
  })
}

export async function recordSecurityEvent(opts: {
  user: Actor | string
  event: SecurityEventType
  detail?: SecurityEventDetail
  headers?: Headers | null
}) {
  const detail = opts.detail ?? {}
  const user =
    typeof opts.user === 'string'
      ? await dbFirst<Actor>(`SELECT id, email, name FROM "user" WHERE id = ?`, [opts.user])
      : opts.user
  if (!user) return
  const info = requestInfo(opts.headers)
  const hasDetail = Object.values(detail).some((v) => v != null)

  // Structured line for Workers Logs, alongside the per-user table.
  console.log(JSON.stringify({ security_event: opts.event, user_id: user.id, ...detail, ip: info.ip }))

  await dbRun(
    `INSERT INTO security_events (user_id, event, detail, ip, country, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, opts.event, hasDetail ? JSON.stringify(detail) : null, info.ip, info.country, info.userAgent],
  )
  await dbRun(
    `DELETE FROM security_events WHERE user_id = ? AND id NOT IN
       (SELECT id FROM security_events WHERE user_id = ? ORDER BY id DESC LIMIT ${MAX_EVENTS_PER_USER})`,
    [user.id, user.id],
  )

  if (SECURITY_EVENTS[opts.event].notify) {
    waitUntil(
      sendSecurityEmail(user, opts.event, detail, info).catch((e) =>
        console.error(`Failed to send security email (${opts.event}) to user ${user.id}`, e),
      ),
    )
  }
}

async function pendingTwoFactorUserId(ctx: GenericEndpointContext) {
  const cookie = ctx.context.createAuthCookie('two_factor')
  const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
  if (!identifier) return undefined
  return (await ctx.context.internalAdapter.findVerificationValue(identifier))?.value
}

async function twoFactorState(ctx: GenericEndpointContext, userId: string) {
  const user = (await ctx.context.internalAdapter.findUserById(userId)) as { twoFactorEnabled?: boolean | null } | null
  const row = await ctx.context.adapter.findOne<{ verified: boolean | null }>({
    model: 'twoFactor',
    where: [{ field: 'userId', value: userId }],
  })
  const enabled = !!user?.twoFactorEnabled
  return { enabled, totp: enabled && !!row && row.verified !== false }
}

const headersOf = (ctx: GenericEndpointContext | null | undefined) => ctx?.request?.headers ?? ctx?.headers ?? null

export function securityActivity() {
  const snapshots = new WeakMap<Request, Snapshot>()

  return {
    id: 'security-activity',
    init() {
      return {
        options: {
          databaseHooks: {
            account: {
              create: {
                // Sign-up is disabled, so a new non-credential account row always means a
                // provider was linked to an existing user — explicitly from /account, or
                // automatically at sign-in via a matching email (see accountLinking in auth.ts).
                async after(account, ctx) {
                  if (account.providerId === 'credential') return
                  await recordSecurityEvent({
                    user: account.userId,
                    event: 'account_linked',
                    detail: { provider: account.providerId },
                    headers: headersOf(ctx),
                  })
                },
              },
            },
          },
        },
      }
    },
    endpoints: {
      listSecurityActivity: createAuthEndpoint(
        '/security-activity',
        { method: 'GET', use: [sessionMiddleware] },
        async (ctx) => {
          const rows = await dbAll<Omit<SecurityEventRow, 'detail'> & { detail: string | null }>(
            `SELECT id, event, detail, ip, country, user_agent, created_at FROM security_events
             WHERE user_id = ? ORDER BY id DESC LIMIT 50`,
            [ctx.context.session.user.id],
          )
          return ctx.json(rows.map((r): SecurityEventRow => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })))
        },
      ),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => SNAPSHOT_PATHS.has(ctx.path ?? '') || !!ctx.path?.startsWith('/two-factor/'),
          handler: createAuthMiddleware(async (ctx) => {
            if (!ctx.request) return
            const session = await getSessionFromCtx(ctx)
            const snap: Snapshot = {
              user: session ? { id: session.user.id, email: session.user.email, name: session.user.name } : null,
            }
            const body = (ctx.body ?? {}) as Record<string, unknown>
            if (ctx.path.startsWith('/two-factor/') || ctx.path === '/security-key/verify-authentication') {
              if (session) {
                const state = await twoFactorState(ctx, session.user.id)
                snap.twoFactorEnabled = state.enabled
                snap.totp = state.totp
              } else snap.pendingUserId = await pendingTwoFactorUserId(ctx)
            } else if (ctx.path === '/passkey/delete-passkey' || ctx.path === '/security-key/delete') {
              const row = await ctx.context.adapter.findOne<{ name: string | null }>({
                model: ctx.path === '/passkey/delete-passkey' ? 'passkey' : 'securityKey',
                where: [{ field: 'id', value: String(body.id ?? '') }],
              })
              snap.itemName = row?.name ?? null
            } else if (ctx.path === '/reset-password') {
              const token = String(body.token ?? (ctx.query as { token?: string } | undefined)?.token ?? '')
              snap.resetUserId = token
                ? (await ctx.context.internalAdapter.findVerificationValue(`reset-password:${token}`))?.value
                : undefined
            }
            snapshots.set(ctx.request, snap)
          }),
        },
      ],
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const path = ctx.path
            const failed = isAPIError(ctx.context.returned)
            const snap = ctx.request ? snapshots.get(ctx.request) : undefined
            const headers = headersOf(ctx)
            const body = (ctx.body ?? {}) as Record<string, unknown>
            const log = (user: Actor | string, event: SecurityEventType, detail?: SecurityEventDetail) =>
              recordSecurityEvent({ user, event, detail, headers })

            try {
              // --- Sign-ins (logged, never emailed)
              const newSession = ctx.context.newSession
              const signInMethod =
                path === '/callback/:id' ? (ctx.params as { id?: string } | undefined)?.id : SIGN_IN_METHODS[path]
              // 2FA verification endpoints are also used while signed in (to confirm setup); only
              // count them as sign-ins when there was no session going in.
              const isSignInPath = signInMethod && !(snap?.user && path.startsWith('/two-factor/'))
              if (isSignInPath && newSession) {
                await log(newSession.user.id, 'sign_in', { method: signInMethod })
                return
              }
              if (isSignInPath && failed) {
                if (path === '/sign-in/email' && typeof body.email === 'string') {
                  const user = await dbFirst<Actor>(`SELECT id, email, name FROM "user" WHERE email = ?`, [
                    body.email.toLowerCase(),
                  ])
                  if (user) await log(user, 'sign_in_failed', { method: signInMethod })
                } else if (snap?.pendingUserId && path !== '/two-factor/send-otp') {
                  await log(snap.pendingUserId, 'sign_in_failed', { method: signInMethod })
                } else if (path === '/passkey/verify-authentication') {
                  const credentialID = (body.response as { id?: string } | undefined)?.id
                  const pk = credentialID
                    ? await ctx.context.adapter.findOne<{ userId: string }>({
                        model: 'passkey',
                        where: [{ field: 'credentialID', value: credentialID }],
                      })
                    : null
                  if (pk) await log(pk.userId, 'sign_in_failed', { method: signInMethod })
                }
                return
              }
              if (failed || !snap) return

              // --- Account changes (logged and emailed)
              if (path === '/reset-password' && snap.resetUserId) return await log(snap.resetUserId, 'password_changed')
              const user = snap.user
              if (!user) return
              switch (path) {
                case '/change-password':
                  return await log(user, 'password_changed')
                case '/passkey/verify-registration':
                  return await log(user, 'passkey_added', { name: (body.name as string | undefined) || null })
                case '/passkey/delete-passkey':
                  return await log(user, 'passkey_removed', { name: snap.itemName })
                case '/security-key/verify-registration':
                  return await log(user, 'security_key_added', { name: (body.name as string | undefined) || null })
                case '/security-key/delete':
                  return await log(user, 'security_key_removed', { name: snap.itemName })
                case '/unlink-account':
                  return await log(user, 'account_unlinked', { provider: body.providerId as string })
                case '/two-factor/generate-backup-codes':
                  return await log(user, 'backup_codes_regenerated')
              }
              if (path.startsWith('/two-factor/')) {
                const now = await twoFactorState(ctx, user.id)
                if (!snap.twoFactorEnabled && now.enabled) await log(user, 'two_factor_enabled')
                if (snap.twoFactorEnabled && !now.enabled) await log(user, 'two_factor_disabled')
                if (!snap.totp && now.totp) await log(user, 'totp_enabled')
              }
            } catch (e) {
              // Never let logging break the actual auth flow.
              console.error(`Failed to record security activity for ${path}`, e)
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
