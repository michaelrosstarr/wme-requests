import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Anchor, Button, Group, Paper, Text } from '@mantine/core'
import { usePostHog } from '@posthog/react'

const STORAGE_KEY = 'wme-requests-cookie-consent'

type Consent = 'accepted' | 'rejected'

export default function CookieConsent() {
  const posthog = usePostHog()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Consent | null
    if (stored === 'accepted') posthog?.opt_in_capturing()
    else if (!stored) setVisible(true)
    // PostHog is initialized with opt_out_capturing_by_default, so a 'rejected' or missing
    // choice both leave analytics off — only 'accepted' needs an explicit opt-in call.
    // (posthog is undefined when VITE_PUBLIC_POSTHOG_* isn't configured — see __root.tsx.)
  }, [posthog])

  function choose(consent: Consent) {
    localStorage.setItem(STORAGE_KEY, consent)
    if (consent === 'accepted') posthog?.opt_in_capturing()
    setVisible(false)
  }

  if (!visible) return null

  return (
    <Paper
      withBorder
      shadow="md"
      p="md"
      radius="md"
      pos="fixed"
      bottom={16}
      left={16}
      right={16}
      style={{ zIndex: 1000, maxWidth: 480, marginInline: 'auto' }}
    >
      <Text size="sm" mb="sm">
        We use essential cookies to keep you signed in, and — only with your consent — PostHog analytics cookies to
        understand how the dashboard is used. See our{' '}
        <Anchor component={Link} to="/privacy" size="sm">
          Privacy Policy
        </Anchor>{' '}
        for details.
      </Text>
      <Group justify="flex-end" gap="xs">
        <Button variant="default" size="xs" onClick={() => choose('rejected')}>
          Reject analytics
        </Button>
        <Button size="xs" onClick={() => choose('accepted')}>
          Accept
        </Button>
      </Group>
    </Paper>
  )
}
