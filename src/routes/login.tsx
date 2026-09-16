import { useRef, useState } from 'react'
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
import { Gamepad2, Map } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
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
  const [discordLoading, setDiscordLoading] = useState(false)

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
    const { data: session } = await authClient.getSession()
    if (session?.user.id) {
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
      })
    }
    posthog.capture('user_signed_in', { authentication_method: 'email' })
    navigate({ to: '/requests' })
  }

  async function handleDiscordSignIn() {
    setError(null)
    setDiscordLoading(true)
    // A user whose Discord email matches an existing account gets linked to it automatically
    // (see the `account.accountLinking` config in src/lib/auth.ts) — there's no separate
    // "link your account" step to walk them through.
    const { error: signInError } = await authClient.signIn.social({
      provider: 'discord',
      callbackURL: '/requests',
    })
    if (signInError) {
      setDiscordLoading(false)
      setError(signInError.message ?? 'Discord sign in failed')
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
        <Button
          variant="default"
          leftSection={<Gamepad2 size={16} />}
          loading={discordLoading}
          fullWidth
          onClick={handleDiscordSignIn}
        >
          Sign in with Discord
        </Button>
      </Paper>
    </Center>
  )
}
