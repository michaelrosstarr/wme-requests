import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Alert, Button, Center, Group, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { Map } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/login')({ component: Login })

function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await authClient.signIn.email({ email, password })
    setLoading(false)
    if (signInError) {
      setError(signInError.message ?? 'Sign in failed')
      return
    }
    navigate({ to: '/requests' })
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
            <Button type="submit" loading={loading} fullWidth>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
