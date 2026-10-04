import { Link } from '@tanstack/react-router'
import { Anchor, Container, Group, Text } from '@mantine/core'

const CONTACT_EMAIL = 'wazer@wmekit.com'

// Matches the wmekit.com site's footer (../wazetools/src/Site.tsx). Sits on the page background (`--kit-ground`).
export default function Footer() {
  return (
    <Container size="xl" component="footer" py="lg">
      <div className="kit-rule" />
      <Group justify="space-between" gap="xs" wrap="wrap" pt="md">
        <Text size="xs" className="kit-muted">
          WME Requests is an independent, unofficial tool for Waze Map Editors — not affiliated with Waze or Google.
        </Text>
        <Group gap="md" wrap="wrap">
          <Anchor component={Link} to="/privacy" size="xs" fw={600} c="inherit">
            Privacy Policy
          </Anchor>
          <Anchor component={Link} to="/terms" size="xs" fw={600} c="inherit">
            Terms of Service
          </Anchor>
          <Anchor href={`mailto:${CONTACT_EMAIL}`} size="xs" fw={600} c="inherit">
            {CONTACT_EMAIL}
          </Anchor>
        </Group>
      </Group>
    </Container>
  )
}
