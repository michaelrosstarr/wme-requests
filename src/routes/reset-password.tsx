import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Alert, Button, Center, Group, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { Map } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/reset-password')({ component: ResetPassword })

function ResetPassword() {
  const navigate = useNavigate()
  const search = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const token = search.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (!token) {
      setError('Missing or invalid reset link')
      return
    }
    setLoading(true)
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token })
    setLoading(false)
    if (resetError) {
      setError(resetError.message ?? 'Could not set password')
      return
    }
    setDone(true)
    setTimeout(() => navigate({ to: '/login' }), 2000)
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
        {done ? (
          <Text>Password set — redirecting to sign in…</Text>
        ) : (
          <form onSubmit={handleSubmit}>
            <Stack>
              {!token && (
                <Alert color="red" title="Invalid link">
                  This reset link is missing its token. Request a new one or contact an admin.
                </Alert>
              )}
              {error && (
                <Alert color="red" title="Could not set password">
                  {error}
                </Alert>
              )}
              <PasswordInput
                label="New password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
              <PasswordInput
                label="Confirm password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.currentTarget.value)}
              />
              <Button type="submit" loading={loading} disabled={!token} fullWidth>
                Set password
              </Button>
            </Stack>
          </form>
        )}
      </Paper>
    </Center>
  )
}
