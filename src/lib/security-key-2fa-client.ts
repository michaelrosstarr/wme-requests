import type { BetterAuthClientPlugin } from 'better-auth/client'
import { startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser'
import type { securityKey2fa } from './security-key-2fa'

// Client half of src/lib/security-key-2fa.ts. Endpoints are inferred onto the auth client
// (authClient.securityKey.list(), authClient.twoFactorStatus(), …); the actions below wrap the
// browser WebAuthn ceremony around them.
type Result<T> = { data: T; error: null } | { data: null; error: { message: string } }

function ceremonyError(e: unknown) {
  if (e instanceof WebAuthnError && e.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return 'That security key is already registered'
  }
  if (e instanceof Error && e.name === 'NotAllowedError') return 'Security key prompt was cancelled or timed out'
  return e instanceof Error ? e.message : 'Security key prompt failed'
}

export const securityKey2faClient = () =>
  ({
    id: 'security-key-2fa',
    $InferServerPlugin: {} as ReturnType<typeof securityKey2fa>,
    pathMethods: {
      '/security-key/generate-authenticate-options': 'POST',
      '/security-key/verify-authentication': 'POST',
      '/security-key/verify-registration': 'POST',
      '/security-key/delete': 'POST',
    },
    getActions: ($fetch) => ({
      securityKeyCeremony: {
        /** Signed in with 2FA on: prompt for a key and register it. */
        async register(name?: string): Promise<Result<true>> {
          const opts = await $fetch<Parameters<typeof startRegistration>[0]['optionsJSON']>(
            '/security-key/generate-register-options',
            { method: 'GET' },
          )
          if (opts.error)
            return { data: null, error: { message: opts.error.message ?? 'Could not start registration' } }
          let response
          try {
            response = await startRegistration({ optionsJSON: opts.data })
          } catch (e) {
            return { data: null, error: { message: ceremonyError(e) } }
          }
          const verified = await $fetch('/security-key/verify-registration', {
            method: 'POST',
            body: { response, name },
          })
          if (verified.error) return { data: null, error: { message: verified.error.message ?? 'Registration failed' } }
          return { data: true, error: null }
        },
        /**
         * Mid-sign-in (after a password sign-in returned twoFactorRedirect): fetch a challenge.
         * Resolves to null data when the user has no keys registered, so the caller can hide the option.
         */
        async challenge(): Promise<Parameters<typeof startAuthentication>[0]['optionsJSON'] | null> {
          const opts = await $fetch<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
            '/security-key/generate-authenticate-options',
            // Better Auth rejects a POST without a JSON content type, even with nothing to send.
            { method: 'POST', body: {} },
          )
          return opts.data ?? null
        },
        /** Prompt for the key against a challenge from `challenge()` and finish signing in. */
        async verify(
          optionsJSON: Parameters<typeof startAuthentication>[0]['optionsJSON'],
          trustDevice: boolean,
        ): Promise<Result<true>> {
          let response
          try {
            response = await startAuthentication({ optionsJSON })
          } catch (e) {
            return { data: null, error: { message: ceremonyError(e) } }
          }
          const verified = await $fetch('/security-key/verify-authentication', {
            method: 'POST',
            body: { response, trustDevice },
          })
          if (verified.error) return { data: null, error: { message: verified.error.message ?? 'Verification failed' } }
          return { data: true, error: null }
        },
      },
    }),
    atomListeners: [{ matcher: (path) => path === '/security-key/verify-authentication', signal: '$sessionSignal' }],
  }) satisfies BetterAuthClientPlugin
