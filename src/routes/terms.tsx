import { createFileRoute, Link } from '@tanstack/react-router'
import { Anchor, Card, Container, List, Stack, Text, Title } from '@mantine/core'

export const Route = createFileRoute('/terms')({ component: Terms })

const CONTACT_EMAIL = 'wazer@wazetools.com'
const EFFECTIVE_DATE = '22 September 2026'

function Terms() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={1}>Terms of Service</Title>
          <Text c="dimmed" size="sm" mt={4}>
            Effective {EFFECTIVE_DATE}
          </Text>
        </div>

        <Text>
          These terms govern your use of WME Requests (the "Service"), a companion dashboard and browser userscript
          for Waze Map Editors. The Service is an independent, unofficial community tool — it is not affiliated with,
          endorsed by, or operated by Waze or Google. By using the Service, you agree to these terms. Questions can be
          sent to <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor>.
        </Text>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>1. What the Service does</Title>
            <Text>
              The Service lets Waze Map Editors submit downlock, uplock, imagery, and permissions-request (PUR)
              requests from inside the Waze Map Editor via a browser userscript, view and track those requests on a
              dashboard, and — for admins — route them to configured notification channels (Slack, Discord, Telegram,
              email, and others; see our{' '}
              <Anchor component={Link} to="/privacy">
                Privacy Policy
              </Anchor>{' '}
              for the full list).
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>2. Accounts</Title>
            <List spacing="xs">
              <List.Item>
                Dashboard accounts are provisioned or invited by an existing admin — there's no public sign-up.
              </List.Item>
              <List.Item>You're responsible for keeping your login credentials confidential and for all activity under your account.</List.Item>
              <List.Item>
                If you configure a notification channel with your own third-party credentials (a webhook URL, bot
                token, service-account key, or email credential), you're responsible for that credential's validity,
                scope, and compliance with the relevant third party's own terms.
              </List.Item>
              <List.Item>We may suspend or remove an account that violates these terms or is used to abuse the Service.</List.Item>
            </List>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>3. Acceptable use</Title>
            <Text>You agree not to:</Text>
            <List spacing="xs">
              <List.Item>Submit false, misleading, or spam requests, or otherwise abuse the request-submission endpoint.</List.Item>
              <List.Item>Attempt to bypass or defeat bot-verification (Cloudflare Turnstile) or rate limits.</List.Item>
              <List.Item>Use the Service to harass, defame, or collect data about other editors beyond what it's designed to show.</List.Item>
              <List.Item>Attempt to gain unauthorized access to accounts, data, or infrastructure of the Service.</List.Item>
              <List.Item>Use the Service in a way that violates Waze's or Google's own terms of service.</List.Item>
            </List>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>4. Content you submit</Title>
            <Text>
              When you submit a request (including any notes, screenshot, or permalink), you grant the Service a
              license to store, process, and forward that content to the notification channels an admin has
              configured for the relevant country or region, and to display it on the dashboard and public request
              feed/RSS. You're responsible for making sure content you submit doesn't infringe anyone else's rights
              or violate applicable law.
            </Text>
            <Text>
              Request records are automatically and permanently deleted 24 hours after submission. Any decision or
              notification you want to keep a record of should be captured elsewhere (e.g. the notification channel
              it was routed to) before that window closes.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>5. Third-party services</Title>
            <Text>
              The Service runs on Cloudflare (Workers, D1, R2, Turnstile) and uses PostHog for analytics; admins may
              additionally connect Slack, Discord, Telegram, Google, Postmark, Mailgun, SMTP, ntfy, or Gotify. Your
              use of any such integration is also subject to that third party's own terms — we don't control, and
              aren't responsible for, their availability, content, or practices. See our{' '}
              <Anchor component={Link} to="/privacy">
                Privacy Policy
              </Anchor>{' '}
              for details on what's shared with each.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>6. Availability and disclaimer</Title>
            <Text>
              The Service is provided "as is" and "as available," without warranties of any kind, express or implied,
              including fitness for a particular purpose or uninterrupted availability. We don't guarantee that a
              notification will be delivered successfully by a third-party channel, or that the Service will always
              be available or error-free.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>7. Limitation of liability</Title>
            <Text>
              To the fullest extent permitted by law, the Service and its operator won't be liable for any indirect,
              incidental, or consequential damages arising from your use of, or inability to use, the Service —
              including missed or delayed notifications, lost data, or map-editing decisions made based on
              information shown by the Service.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>8. Changes</Title>
            <Text>
              We may update these terms or the Service itself at any time. Material changes will be reflected by
              updating the effective date above. Continuing to use the Service after a change means you accept the
              updated terms.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>9. Contact</Title>
            <Text>
              For questions about these terms, email <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor>
              .
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  )
}
