import { Link } from '@tanstack/react-router'
import { Anchor, Container, Divider, Group, Text } from '@mantine/core'

const CONTACT_EMAIL = 'wazer@wazetools.com'

export default function Footer() {
  return (
    <Container size="xl" component="footer" py="lg">
      <Divider mb="md" />
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed">
          WME Requests is an independent, unofficial tool for Waze Map Editors — not affiliated with Waze or Google.
        </Text>
        <Group gap="md">
          <Anchor component={Link} to="/privacy" size="xs" c="dimmed">
            Privacy Policy
          </Anchor>
          <Anchor component={Link} to="/terms" size="xs" c="dimmed">
            Terms of Service
          </Anchor>
          <Anchor href={`mailto:${CONTACT_EMAIL}`} size="xs" c="dimmed">
            {CONTACT_EMAIL}
          </Anchor>
        </Group>
      </Group>
    </Container>
  )
}
