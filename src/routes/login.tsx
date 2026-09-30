import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Alert,
  Anchor,
  Button,
  Center,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core'
import { usePostHog } from '@posthog/react'
import { KeyRound, Map } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { SOCIAL_PROVIDERS, type SocialProviderId } from '@/lib/social-providers'
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile'

export const Route = createFileRoute('/login')({ component: Login })

const TURNSTILE_SITE_KEY = import.meta.env.VITE_PUBLIC_TURNSTILE_SITE_KEY as string | undefined

function Login() {
  const navigate = useNavigate()
  const posthog = usePostHog()
  const turnstileRef = useRef<TurnstileHandle>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<SocialProviderId | null>(null)

  async function completeSignIn(method: 'email' | 'passkey') {
    const { data: session } = await authClient.getSession()
    if (session?.user.id) {
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
      })
    }
    posthog.capture('user_signed_in', { authentication_method: method })
    navigate({ to: '/requests' })
  }

  // Passkey autofill (WebAuthn conditional UI): offers saved passkeys in the email field's
  // autofill dropdown. The request stays pending until the user picks one; any failure here
  // (unsupported, dismissed, or aborted by the explicit button below) is silently ignored.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (typeof PublicKeyCredential === 'undefined') return
      if (!(await PublicKeyCredential.isConditionalMediationAvailable?.())) return
      if (cancelled) return
      const { error: passkeyError } = await authClient.signIn.passkey({ autoFill: true })
      if (!passkeyError && !cancelled) await completeSignIn('passkey')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Please complete the verification challenge')
      return
    }
    setLoading(true)
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
      fetchOptions: captchaToken ? { headers: { 'x-captcha-response': captchaToken } } : undefined,
    })
    setLoading(false)
    // A Turnstile token is single-use — reset the widget for the next attempt regardless
    // of outcome.
    turnstileRef.current?.reset()
    setCaptchaToken(null)
    if (signInError) {
      setError(signInError.message ?? 'Sign in failed')
      return
    }
    await completeSignIn('email')
  }

  async function handlePasskeySignIn() {
    setError(null)
    setPasskeyLoading(true)
    const { error: signInError } = await authClient.signIn.passkey()
    setPasskeyLoading(false)
    if (signInError) {
      setError(signInError.message ?? 'Passkey sign in failed')
      return
    }
    await completeSignIn('passkey')
  }

  async function handleSocialSignIn(providerId: SocialProviderId, label: string) {
    setError(null)
    setSocialLoading(providerId)
    // A user whose provider email matches an existing account gets linked to it automatically
    // (see the `account.accountLinking` config in src/lib/auth.ts) — there's no separate
    // "link your account" step to walk them through. Differing emails can be linked from /account.
    const { error: signInError } = await authClient.signIn.social({
      provider: providerId,
      callbackURL: '/requests',
    })
    if (signInError) {
      setSocialLoading(null)
      setError(signInError.message ?? `${label} sign in failed`)
    }
  }

  return (
    <Center mih="80vh">
      <Paper withBorder p="xl" radius="md" w={360}>
        <Title order={3} mb="md">
          <Group gap="xs" wrap="nowrap">
            <Map size={20} />
            WME Requests
          </Group>
        </Title>
        <form onSubmit={handleSubmit}>
          <Stack>
            {error && (
              <Alert color="red" title="Sign in failed">
                {error}
              </Alert>
            )}
            <TextInput
              label="Email"
              type="email"
              autoComplete="username webauthn"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              label="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            {TURNSTILE_SITE_KEY && (
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
              />
            )}
            <Button type="submit" loading={loading} fullWidth>
              Sign in
            </Button>
            <Anchor component={Link} to="/forgot-password" size="sm" ta="center">
              Forgot password?
            </Anchor>
          </Stack>
        </form>
        <Divider label="or" my="md" />
        <Stack gap="xs">
          <Button
            variant="default"
            leftSection={<KeyRound size={16} />}
            loading={passkeyLoading}
            fullWidth
            onClick={handlePasskeySignIn}
          >
            Sign in with passkey
          </Button>
          {SOCIAL_PROVIDERS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="default"
              leftSection={<Icon size={16} />}
              loading={socialLoading === id}
              fullWidth
              onClick={() => handleSocialSignIn(id, label)}
            >
              Sign in with {label}
            </Button>
          ))}
        </Stack>
      </Paper>
    </Center>
  )
}
