import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Anchor, Button, Container, Group, Title } from '@mantine/core'
import { LogOut, Map } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export default function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()

  async function handleSignOut() {
    await authClient.signOut()
    navigate({ to: '/login' })
  }

  return (
    <Container size="xl" component="header" py="md">
      <Group justify="space-between" wrap="nowrap">
        <Title order={3}>
          <Anchor component={Link} to="/" underline="never" c="inherit">
            <Group gap="xs" wrap="nowrap">
              <Map size={20} />
              WME Requests
            </Group>
          </Anchor>
        </Title>
        <Group gap="xs">
          <Button component={Link} to="/" variant={pathname === '/' ? 'filled' : 'subtle'}>
            Dashboard
          </Button>
          <Button component={Link} to="/admin" variant={pathname === '/admin' ? 'filled' : 'subtle'}>
            Admin
          </Button>
          <Button component={Link} to="/reports" variant={pathname === '/reports' ? 'filled' : 'subtle'}>
            Reports
          </Button>
          {session && (
            <Button variant="default" leftSection={<LogOut size={14} />} onClick={handleSignOut}>
              Sign out
            </Button>
          )}
        </Group>
      </Group>
    </Container>
  )
}
