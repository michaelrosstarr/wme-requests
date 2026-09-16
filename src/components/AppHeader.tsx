import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Anchor, Burger, Button, Container, Divider, Drawer, Group, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { usePostHog } from '@posthog/react'
import { useEffect } from 'react'
import { LogIn, LogOut, Map } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

const NAV_LINKS = [
  { to: '/', label: 'Home', authOnly: false },
  { to: '/requests', label: 'Requests', authOnly: false },
  { to: '/admin', label: 'Admin', authOnly: true },
  { to: '/reports', label: 'Reports', authOnly: true },
  { to: '/help', label: 'Help', authOnly: false },
] as const

export default function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const posthog = usePostHog()
  const { data: session } = authClient.useSession()
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false)
  const visibleLinks = NAV_LINKS.filter((link) => !link.authOnly || session)

  useEffect(() => {
    if (!session?.user.id) return
    posthog.identify(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    })
  }, [posthog, session?.user.email, session?.user.id, session?.user.name])

  async function handleSignOut() {
    await authClient.signOut()
    posthog.capture('user_signed_out')
    posthog.reset()
    closeDrawer()
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

        <Group gap="xs" visibleFrom="sm">
          {visibleLinks.map((link) => (
            <Button key={link.to} component={Link} to={link.to} variant={pathname === link.to ? 'filled' : 'subtle'}>
              {link.label}
            </Button>
          ))}
          {session ? (
            <Button variant="default" leftSection={<LogOut size={14} />} onClick={handleSignOut}>
              Sign out
            </Button>
          ) : (
            <Button component={Link} to="/login" variant="default" leftSection={<LogIn size={14} />}>
              Sign in
            </Button>
          )}
        </Group>

        <Burger hiddenFrom="sm" opened={drawerOpened} onClick={toggleDrawer} aria-label="Toggle navigation menu" />
      </Group>

      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        hiddenFrom="sm"
        position="right"
        size="xs"
        title="Menu"
      >
        <Stack gap="xs">
          {visibleLinks.map((link) => (
            <Button
              key={link.to}
              component={Link}
              to={link.to}
              variant={pathname === link.to ? 'filled' : 'subtle'}
              fullWidth
              justify="flex-start"
              onClick={closeDrawer}
            >
              {link.label}
            </Button>
          ))}
          <Divider my={4} />
          {session ? (
            <Button variant="default" leftSection={<LogOut size={14} />} fullWidth justify="flex-start" onClick={handleSignOut}>
              Sign out
            </Button>
          ) : (
            <Button
              component={Link}
              to="/login"
              variant="default"
              leftSection={<LogIn size={14} />}
              fullWidth
              justify="flex-start"
              onClick={closeDrawer}
            >
              Sign in
            </Button>
          )}
        </Stack>
      </Drawer>
    </Container>
  )
}
