import { useState } from 'react'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Button, Center, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { LogOut, ShieldAlert } from 'lucide-react'
import { getSessionFn } from '@/lib/get-session-fn'
import { accountLink } from '@/lib/session'
import SigningOutOverlay from '@/components/SigningOutOverlay'

export const Route = createFileRoute('/_protected')({
  beforeLoad: async ({ location }) => {
    const { session, authUrl, appUrl } = await getSessionFn()
    if (!session) {
      // /login hands off to the WazeTools account service and brings them back here.
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    return { session, authUrl, appUrl }
  },
  component: Protected,
})

function Protected() {
  const { session, authUrl, appUrl } = Route.useRouteContext()
  // Any WazeTools account can sign in; only users an admin has added get further.
  if (!session.access) return <NoAccess email={session.user.email} authUrl={authUrl} appUrl={appUrl} />
  return <Outlet />
}

function NoAccess({ email, authUrl, appUrl }: { email: string; authUrl: string; appUrl: string }) {
  const [signingOut, setSigningOut] = useState(false)
  return (
    <Center mih="60vh">
      <SigningOutOverlay visible={signingOut} />
      <Paper withBorder p="xl" radius="md" maw={440}>
        <Stack>
          <Title order={3}>
            <Group gap="xs" wrap="nowrap">
              <ShieldAlert size={20} />
              Ask an admin for access
            </Group>
          </Title>
          <Text size="sm">
            You're signed in as <strong>{email}</strong>, but this account hasn't been given access to WME Requests yet.
          </Text>
          <Text size="sm" c="dimmed">
            Ask a WME Requests admin for your community to add you with this email address. Once they have, reload this
            page.
          </Text>
          <Group>
            <Button variant="default" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button
              variant="subtle"
              component="a"
              href={accountLink(authUrl, '/logout', `${appUrl}/`)}
              onClick={() => setSigningOut(true)}
              leftSection={<LogOut size={14} />}
            >
              Use a different account
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Center>
  )
}
