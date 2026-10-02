import { createFileRoute } from '@tanstack/react-router'
import { Anchor, Card, Container, List, Stack, Text, Title } from '@mantine/core'

export const Route = createFileRoute('/privacy')({ component: Privacy })

const CONTACT_EMAIL = 'wazer@wmekit.com'
const EFFECTIVE_DATE = '2 October 2026'
// The account-wide policy, which this one supplements.
const MAIN_POLICY_URL = 'https://auth.wmekit.com/privacy'

function Privacy() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={1}>Privacy Policy</Title>
          <Text c="dimmed" size="sm" mt={4}>
            Effective {EFFECTIVE_DATE}
          </Text>
        </div>

        <Text>
          WME Requests ("the Service", "we", "us") is a companion dashboard and browser userscript used by Waze Map
          Editors to submit and route lock/imagery/permissions requests. It is an independent, unofficial community
          tool and is not affiliated with, endorsed by, or operated by Waze or Google. For questions, deletion
          requests, or anything related to data protection (including POPIA and GDPR requests), contact{' '}
          <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor>.
        </Text>

        <Card withBorder p="lg" radius="md" bg="var(--mantine-color-blue-light)">
          <Text>
            <b>This policy supplements the main WMEKit Privacy Policy.</b> You sign in to WME Requests with your WMEKit
            account, and everything about that account (your sign-in methods, sessions, security log, the sign-in
            cookies, your rights and how to use them, and how international transfers are handled) is covered by the{' '}
            <Anchor href={MAIN_POLICY_URL}>WMEKit Privacy Policy</Anchor>. This page goes into detail about what WME
            Requests itself collects and does: the requests you submit, notifications, and the data the app keeps
            about your access. Where the two differ about WME Requests, this page applies.
          </Text>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>1. Data we don't collect</Title>
            <Text>
              We only store the personal data described in this policy — nothing beyond what's needed to run the
              Service. We don't buy, sell, or trade personal data, and we don't run advertising of any kind. In
              particular:
            </Text>
            <List spacing="xs">
              <List.Item>
                WME Requests itself doesn't record your IP address or location. Signing in happens on your WMEKit
                account, which keeps a security log of sign-ins (including IP address) as described in the{' '}
                <Anchor href={MAIN_POLICY_URL}>WMEKit Privacy Policy</Anchor>.
              </List.Item>
              <List.Item>
                Submitting a request through the browser userscript doesn't require an account, and we don't collect
                your email address, real name, or Waze account credentials through that flow.
              </List.Item>
              <List.Item>We never see or store your Waze account password.</List.Item>
            </List>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>2. Data we do collect</Title>

            <Title order={3} size="h4">
              Dashboard accounts (editors, moderators, admins)
            </Title>
            <List spacing="xs">
              <List.Item>
                You sign in with your WMEKit account (auth.wmekit.com). Your sign-in details stay there (see the{' '}
                <Anchor href={MAIN_POLICY_URL}>WMEKit Privacy Policy</Anchor>). WME Requests receives your account ID,
                name, email address and profile picture from it, and keeps a copy of your ID, name and email.
              </List.Item>
              <List.Item>Which countries you've been given access to, and your RSS feed token.</List.Item>
              <List.Item>A session cookie, shared across *.wmekit.com, that keeps you signed in.</List.Item>
              <List.Item>
                If you enable browser push notifications, an opaque push subscription endpoint and encryption keys
                issued by your browser — these identify a browser installation, not you personally.
              </List.Item>
            </List>

            <Title order={3} size="h4" mt="sm">
              Requests submitted via the userscript
            </Title>
            <Text>
              When a Waze editor submits a downlock/uplock/imagery/PUR request from inside the Waze Map Editor, the
              Service stores:
            </Text>
            <List spacing="xs">
              <List.Item>Your Waze editor username (as entered/detected in WME) and editor rank.</List.Item>
              <List.Item>The WME permalink to the relevant map location, and any notes you add.</List.Item>
              <List.Item>An optional screenshot of the map viewport, if you choose to attach one.</List.Item>
              <List.Item>The request type, lock level, and timestamps.</List.Item>
            </List>
            <Text size="sm" c="dimmed">
              A Waze username is a public in-game identifier you chose yourself, not your legal name — but we
              recognize it can still identify you, and we treat it accordingly under this policy.
            </Text>

            <Title order={3} size="h4" mt="sm">
              Integration credentials (admin-configured)
            </Title>
            <Text>
              Global admins and users who configure notification channels may store webhook URLs, bot tokens, Google
              service-account keys, or SMTP/Postmark/Mailgun credentials so the Service can deliver notifications on
              their behalf. These are encrypted at rest (see § 5) and are never displayed again after saving.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>3. Notifications and external providers</Title>
            <Text>
              A country's admins choose which of the following channels, if any, receive a copy of a submitted
              request (permalink, notes, lock level, submitter username, and screenshot if attached). We only send
              data to a channel that's been deliberately configured — nothing is sent to a third party by default.
            </Text>
            <List spacing="xs">
              <List.Item>
                <strong>Slack</strong> — via an Incoming Webhook or bot token, posted to a channel of the admin's
                choosing.
              </List.Item>
              <List.Item>
                <strong>Discord</strong> — via a server webhook (message or forum-thread post).
              </List.Item>
              <List.Item>
                <strong>Telegram</strong> — via the Telegram Bot API, to a chat/channel the admin controls.
              </List.Item>
              <List.Item>
                <strong>Google Chat</strong> — via a Google Chat incoming webhook.
              </List.Item>
              <List.Item>
                <strong>Google Sheets</strong> — via the Google Sheets API, appending a row to a spreadsheet the
                admin's Google service account has been given access to.
              </List.Item>
              <List.Item>
                <strong>Email</strong> — via Postmark, Mailgun, or an SMTP server the admin has configured with their
                own credentials.
              </List.Item>
              <List.Item>
                <strong>ntfy</strong> and <strong>Gotify</strong> — self-hosted or third-party push-notification
                servers, posted to an endpoint the admin controls.
              </List.Item>
              <List.Item>
                <strong>Custom webhook</strong> — a plain JSON payload posted to any URL the admin supplies.
              </List.Item>
              <List.Item>
                <strong>Web Push</strong> — native browser notifications for signed-in users who opt in via "Notify
                me". Delivery is relayed through your browser vendor's push service (e.g. Google, Mozilla, or Apple),
                which only sees an encrypted payload and the delivery endpoint, not its contents.
              </List.Item>
              <List.Item>
                <strong>Public RSS feed</strong> — a read-only feed of recent requests that anyone can pull into
                their own RSS reader. This isn't a push to a third party; it's the same public request data already
                shown on the dashboard, made available for you to fetch on your own terms.
              </List.Item>
            </List>
            <Text>
              None of these providers receive dashboard account data (your login email/password) — only the request
              content described above, and only for the countries/regions their channel is scoped to.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>4. Analytics — PostHog</Title>
            <Text>
              We use <Anchor href="https://posthog.com" target="_blank" rel="noopener">PostHog</Anchor> (hosted in the
              EU) for product analytics — understanding which features are used and catching errors. There are two
              categories:
            </Text>
            <List spacing="xs">
              <List.Item>
                <strong>Browser analytics (consent-gated)</strong> — page views, button/feature usage, sign-in events,
                and client-side error capture in your browser. This is off by default and only starts after you
                accept it in the cookie banner (see § 6); you can withdraw consent at any time from that banner. For
                signed-in dashboard users who accept, your user ID, name, and email are attached to your analytics
                profile so we can distinguish one editor's usage from another's.
              </List.Item>
              <List.Item>
                <strong>Server-side operational events (not cookie-gated)</strong> — when the API itself performs an
                action (e.g. a request is created, a notification channel is tested, an invite is sent), our server
                logs that event to PostHog for operational monitoring, similar to a server access log. These use your
                account ID if you're signed in, or a random per-submission identifier for anonymous userscript
                submissions — never anything else that identifies you — and aren't affected by the cookie banner
                choice, since they're a direct, necessary record of the action the API just performed rather than
                behavioral tracking of you browsing the site.
              </List.Item>
            </List>
            <Text>Declining browser analytics doesn't affect your ability to use the Service.</Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>5. Cloudflare and infrastructure</Title>
            <Text>The Service runs entirely on Cloudflare's platform:</Text>
            <List spacing="xs">
              <List.Item>
                <strong>Cloudflare Workers</strong> — hosts the dashboard and API, and sits in front of every request
                to the Service.
              </List.Item>
              <List.Item>
                <strong>Cloudflare D1</strong> — the database storing accounts, requests, notification-channel
                configuration, and encrypted credentials.
              </List.Item>
              <List.Item>
                <strong>Cloudflare R2</strong> — stores screenshots attached to requests.
              </List.Item>
            </List>
            <Text>
              As our infrastructure provider, Cloudflare processes this data on our behalf under its own privacy and
              security commitments; it is not used by Cloudflare for its own purposes.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>6. Cookies</Title>
            <List spacing="xs">
              <List.Item>
                <strong>Strictly necessary</strong> — a session cookie that keeps you signed in to the dashboard.
                These can't be disabled and aren't covered by the cookie banner, since the Service can't function
                without them.
              </List.Item>
              <List.Item>
                <strong>Analytics (optional)</strong> — PostHog cookies/local storage, set only after you accept
                analytics in the cookie banner. See § 4.
              </List.Item>
            </List>
            <Text>
              You can change your analytics choice at any time — clear your browser's local storage for this site to
              see the cookie banner again.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>7. Security</Title>
            <List spacing="xs">
              <List.Item>All traffic is served over HTTPS via Cloudflare.</List.Item>
              <List.Item>Sign-in is handled by the WMEKit account service; WME Requests never sees your password.</List.Item>
              <List.Item>
                Third-party integration credentials (bot tokens, service-account keys, SMTP/email credentials) are
                encrypted at rest with a dedicated encryption key held only as a server-side secret, and are never
                re-displayed after saving.
              </List.Item>
              <List.Item>Access to admin functions (Admin, Reports) requires an authenticated session and is scoped by role and by country/region.</List.Item>
            </List>
            <Text>
              No system is perfectly secure, but we design the Service to minimize what personal data it holds in the
              first place, so there's less to protect and less at risk if something goes wrong.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>8. Data retention</Title>
            <Text>
              Request records (including notes, screenshots, and permalinks) are automatically and permanently
              deleted 24 hours after submission, or sooner if an admin removes them manually. Before a request is
              deleted, an aggregate count of it (submitting editor, country, and request type — no permalink, notes,
              or screenshot) is added to a running per-user tally, which we keep indefinitely to power the Reports
              feature. Account and configuration data (users, countries, channels) is kept for as long as they're
              operationally useful, and deleted when an admin removes them. Analytics events in PostHog follow
              PostHog's own retention settings for our account.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>9. Your rights</Title>
            <Text>
              Your rights over your data in WME Requests are the same as for your WMEKit account: under POPIA, the GDPR
              or other law that applies to you, you can access, correct, export or delete your personal data, or
              object to or restrict certain processing. The{' '}
              <Anchor href={MAIN_POLICY_URL}>WMEKit Privacy Policy</Anchor> explains these rights and how to complain
              to a regulator. To use any of them for WME Requests data, email{' '}
              <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor>. We'll respond within 30 days.
              Removing your access to WME Requests doesn't delete your WMEKit account, and deleting your WMEKit account
              doesn't by itself remove your WME Requests data. Ask, and we'll remove both.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={2}>10. Changes to this policy</Title>
            <Text>
              We may update this policy as the Service changes. We'll update the effective date above, and if a change
              significantly affects how we use your data, we'll tell you before it takes effect. WMEKit is run from
              South Africa.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  )
}
