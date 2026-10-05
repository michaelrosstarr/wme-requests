import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Anchor, Center, Paper, Stack, Text, Title } from '@mantine/core'
import { Home, MapPinOff } from 'lucide-react'

const REDIRECT_SECONDS = 10

/** Shown for any unknown URL (the router's defaultNotFoundComponent); sends the user home. */
export default function NotFound() {
  const navigate = useNavigate()
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS)
  const [stayed, setStayed] = useState(false)

  useEffect(() => {
    if (stayed) return
    if (secondsLeft <= 0) {
      void navigate({ to: '/', replace: true })
      return
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft, stayed, navigate])

  return (
    <Center mih="70vh" px="md">
      <Paper
        radius="lg"
        p={{ base: 'lg', sm: 40 }}
        maw={520}
        w="100%"
        style={{
          border: '2.5px solid var(--kit-ink)',
          background: 'var(--kit-card)',
          boxShadow: '6px 6px 0 var(--kit-shadow)',
        }}
      >
        <Stack align="center" ta="center" gap="md">
          <span className="kit-badge" style={{ background: 'var(--kit-yellow)', width: 72, height: 72 }}>
            <MapPinOff size={34} />
          </span>
          <span className="kit-pill">Error 404</span>
          <Title order={1} fz={{ base: 28, sm: 36 }}>
            This road doesn't go anywhere
          </Title>
          <Text c="dimmed">
            The page you're looking for doesn't exist or has moved. Let's get you back on the map.
          </Text>

          <Link
            to="/"
            replace
            className="kit-chunky kit-button"
            style={{ '--kit-fill': 'var(--kit-green)' } as React.CSSProperties}
          >
            <Home size={18} />
            Back to the homepage
          </Link>

          <Text size="sm" c="dimmed" aria-live="polite">
            {stayed ? (
              'Staying on this page.'
            ) : (
              <>
                Taking you there in {secondsLeft}s ·{' '}
                <Anchor component="button" type="button" size="sm" onClick={() => setStayed(true)}>
                  Stay here
                </Anchor>
              </>
            )}
          </Text>
        </Stack>
      </Paper>
    </Center>
  )
}
