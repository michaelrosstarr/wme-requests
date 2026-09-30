import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { ActionIcon, Anchor, Burger, Button, Container, Divider, Drawer, Group, Menu, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { usePostHog } from '@posthog/react'
import { useEffect } from 'react'
import { CircleUserRound, LogIn, LogOut, Map, UserCog } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

const NAV_LINKS = [
  { to: '/', label: 'Home', authOnly: false },
  { to: '/requests', label: 'Requests', authOnly: true },
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
            <Menu position="bottom-end" width={220} withinPortal>
              <Menu.Target>
                <ActionIcon
                  variant={pathname === '/account' ? 'filled' : 'subtle'}
                  size="lg"
                  radius="xl"
                  aria-label="Profile menu"
                >
                  <CircleUserRound size={22} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Text size="sm" fw={500} c="bright" truncate>
                    {session.user.name}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {session.user.email}
                  </Text>
                </Menu.Label>
                <Menu.Divider />
                <Menu.Item component={Link} to="/account" leftSection={<UserCog size={14} />}>
                  Account
                </Menu.Item>
                <Menu.Item leftSection={<LogOut size={14} />} onClick={handleSignOut}>
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
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
            <>
              <Button
                component={Link}
                to="/account"
                variant={pathname === '/account' ? 'filled' : 'subtle'}
                leftSection={<UserCog size={14} />}
                fullWidth
                justify="flex-start"
                onClick={closeDrawer}
              >
                Account
              </Button>
              <Button variant="default" leftSection={<LogOut size={14} />} fullWidth justify="flex-start" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
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
