import { useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Alert, Anchor, Button, Center, Group, Paper, Text, TextInput, Title } from '@mantine/core'
import { Map } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile'

export const Route = createFileRoute('/forgot-password')({ component: ForgotPassword })

const TURNSTILE_SITE_KEY = import.meta.env.VITE_PUBLIC_TURNSTILE_SITE_KEY as string | undefined

function ForgotPassword() {
  const turnstileRef = useRef<TurnstileHandle>(null)
  const [email, setEmail] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Please complete the verification challenge')
      return
    }
    setLoading(true)
    const { error: requestError } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
      fetchOptions: captchaToken ? { headers: { 'x-captcha-response': captchaToken } } : undefined,
    })
    setLoading(false)
    turnstileRef.current?.reset()
    setCaptchaToken(null)
    if (requestError) {
      setError(requestError.message ?? 'Could not send reset email')
      return
    }
    setSent(true)
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
        {sent ? (
          <Text size="sm">
            If an account exists for <strong>{email}</strong>, we've sent a link to reset the password. Check your
            inbox.
          </Text>
        ) : (
          <form onSubmit={handleSubmit}>
            <Text size="sm" c="dimmed" mb="md">
              Enter your account email and we'll send you a link to reset your password.
            </Text>
            {error && (
              <Alert color="red" title="Could not send reset email" mb="md">
                {error}
              </Alert>
            )}
            <TextInput
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              mb="md"
            />
            {TURNSTILE_SITE_KEY && (
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
              />
            )}
            <Button type="submit" loading={loading} fullWidth mt="md" mb="sm">
              Send reset link
            </Button>
            <Anchor component={Link} to="/login" size="sm">
              Back to sign in
            </Anchor>
          </form>
        )}
      </Paper>
    </Center>
  )
}
