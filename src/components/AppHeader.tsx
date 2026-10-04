import { Link, useRouterState } from '@tanstack/react-router'
import { Anchor, Burger, Button, Container, Divider, Drawer, Group, Menu, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { usePostHog } from '@posthog/react'
import { useEffect, useState } from 'react'
import { CircleUserRound, LogIn, LogOut, UserCog } from 'lucide-react'
import { accountLink, useSession } from '@/lib/session'
import SigningOutOverlay from '@/components/SigningOutOverlay'
import { ColorSchemeToggle, Wordmark } from '@/components/Brand'

const NAV_LINKS = [
  { to: '/', label: 'Home', authOnly: false },
  { to: '/requests', label: 'Requests', authOnly: true },
  { to: '/admin', label: 'Admin', authOnly: true },
  { to: '/reports', label: 'Reports', authOnly: true },
  { to: '/help', label: 'Help', authOnly: false },
] as const

// The current page's header button is filled yellow.
const ACTIVE = { '--kit-fill': 'var(--kit-yellow)' } as React.CSSProperties

export default function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const posthog = usePostHog()
  const { data } = useSession()
  const session = data?.session
  const authUrl = data?.authUrl ?? ''
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false)
  const [signingOut, setSigningOut] = useState(false)
  const visibleLinks = NAV_LINKS.filter((link) => !link.authOnly || session?.access)

  useEffect(() => {
    if (!session?.user.id) return
    posthog.identify(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    })
  }, [posthog, session?.user.email, session?.user.id, session?.user.name])

  // Signing out happens on the account service (it clears the shared cookie for every
  // WMEKit app), which then sends the browser back to our home page.
  // The overlay stays up until the browser has left for the account service.
  function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    posthog.capture('user_signed_out')
    posthog.reset()
    closeDrawer()
    window.location.assign(accountLink(authUrl, '/logout', `${data?.appUrl ?? window.location.origin}/`))
  }

  return (
    <section className="kit-sky kit-sky-header">
      <Container size="xl" component="header" py="md" pos="relative">
        <SigningOutOverlay visible={signingOut} />
        <Group justify="space-between" wrap="nowrap">
          <Anchor component={Link} to="/" underline="never" c="inherit">
            <Wordmark label="WME Requests" />
          </Anchor>

          <Group gap="sm" wrap="nowrap">
            <ColorSchemeToggle />
            <Group gap="sm" wrap="nowrap" visibleFrom="sm">
              {visibleLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="kit-chunky kit-button"
                  style={pathname === link.to ? ACTIVE : undefined}
                >
                  {link.label}
                </Link>
              ))}
              {session ? (
                <Menu position="bottom-end" width={220} withinPortal>
                  <Menu.Target>
                    <button type="button" className="kit-chunky kit-button">
                      <CircleUserRound size={18} />
                      Account
                    </button>
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
                    <Menu.Item component="a" href={accountLink(authUrl, '/account')} leftSection={<UserCog size={14} />}>
                      WMEKit account
                    </Menu.Item>
                    <Menu.Item leftSection={<LogOut size={14} />} onClick={handleSignOut}>
                      Sign out
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              ) : (
                <Link to="/login" search={{ redirect: undefined }} className="kit-chunky kit-button">
                  <LogIn size={18} />
                  Sign in
                </Link>
              )}
            </Group>
            <Burger
              hiddenFrom="sm"
              size="sm"
              className="kit-chunky kit-burger"
              opened={drawerOpened}
              onClick={toggleDrawer}
              aria-label="Toggle navigation menu"
            />
          </Group>
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
                  component="a"
                  href={accountLink(authUrl, '/account')}
                  variant="subtle"
                  leftSection={<UserCog size={14} />}
                  fullWidth
                  justify="flex-start"
                  onClick={closeDrawer}
                >
                  WMEKit account
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
    </section>
  )
}
