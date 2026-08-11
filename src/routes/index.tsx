import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Button,
  Card,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import {
  ArrowRight,
  Bell,
  FileSpreadsheet,
  Gamepad2,
  Globe2,
  Image,
  Lock,
  Mail,
  MapPinned,
  MessageCircle,
  MessageSquare,
  Radio,
  Rss,
  Send,
  ShieldCheck,
  Webhook,
  Server,
} from 'lucide-react'
import { useCountries } from '@/lib/queries'
import 'flag-icons/css/flag-icons.min.css'

// Codes people commonly use that don't match the ISO 3166-1 alpha-2 code flag-icons expects.
const FLAG_ALIASES: Record<string, string> = { uk: 'gb' }

function flagClass(code: string) {
  const normalized = code.trim().toLowerCase()
  if (!/^[a-z]{2}$/.test(normalized)) return null
  return `fi fi-${FLAG_ALIASES[normalized] ?? normalized}`
}

function CountryFlag({ code }: Readonly<{ code: string }>) {
  const cls = flagClass(code)
  return (
    <div
      style={{
        width: 28,
        height: 21,
        borderRadius: 4,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1px light-dark(rgba(0,0,0,.15), rgba(255,255,255,.2))',
        background: 'var(--mantine-color-default-hover)',
      }}
    >
      {cls ? (
        <span className={cls} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Globe2 size={13} opacity={0.5} />
      )}
    </div>
  )
}

export const Route = createFileRoute('/')({ component: Landing })

const NOTIFICATION_METHODS = [
  { icon: MessageSquare, label: 'Slack', description: 'Formatted cards via Incoming Webhooks, including threaded channels.' },
  { icon: Gamepad2, label: 'Discord', description: 'Rich embeds, or new forum posts for Forum-type channels.' },
  { icon: Send, label: 'Telegram', description: 'Bot messages, with the request screenshot attached when available.' },
  { icon: Mail, label: 'Email', description: 'BYOK sending via Postmark, Mailgun, or plain SMTP.' },
  { icon: MessageCircle, label: 'Google Chat', description: 'Text messages posted to a Space via an incoming webhook.' },
  { icon: FileSpreadsheet, label: 'Google Sheets', description: 'Appends a row to a spreadsheet using a service account, adding headers automatically on the first write.' },
  { icon: Webhook, label: 'Webhook', description: 'Plain JSON POST to any endpoint you control.' },
  { icon: Radio, label: 'ntfy', description: 'Push to a public ntfy.sh topic or a self-hosted server.' },
  { icon: Server, label: 'Gotify', description: 'Push notifications via a self-hosted Gotify server.' },
  { icon: Bell, label: 'Web Push', description: 'Native browser notifications — no admin setup, just sign in and subscribe.' },
  { icon: Rss, label: 'RSS / Atom Feed', description: 'A read-only feed for any reader, filterable by country, region, or type.' },
]

const FEATURES = [
  {
    icon: Lock,
    title: 'Downlocks, Imagery & PUR',
    description: 'Purpose-built for the most common Waze Map Editor escalation types, including place update accept/decline.',
  },
  {
    icon: MapPinned,
    title: 'Country & Region Scoped',
    description: 'Route requests and notifications down to a specific country or region, or keep it global.',
  },
  {
    icon: ShieldCheck,
    title: 'Access Controlled',
    description: 'Give editors visibility into only the countries they manage, or grant global access.',
  },
  {
    icon: Image,
    title: 'Screenshot Attachments',
    description: 'Requests submitted with a screenshot carry it through to email and Telegram notifications.',
  },
]

function Landing() {
  const countriesQuery = useCountries()
  const countries = countriesQuery.data ?? []

  return (
    <Container size="lg" pb={80}>
      <Stack align="center" ta="center" gap="md" py={{ base: 40, sm: 64 }}>
        <Title order={1} fz={{ base: 32, sm: 44 }} maw={720}>
          Downlock, imagery &amp; place update requests, tracked and delivered where you already work
        </Title>
        <Text size="lg" c="dimmed" maw={640}>
          A shared queue for Waze Map Editor requests, submitted straight from WME via a userscript, and pushed out
          to Slack, Discord, Telegram, email, and more — scoped by country and region.
        </Text>
        <Group mt="sm">
          <Button component={Link} to="/requests" size="md" rightSection={<ArrowRight size={16} />}>
            View Requests
          </Button>
          <Button component={Link} to="/help" size="md" variant="default">
            Setup Guide
          </Button>
        </Group>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" mb={64}>
        {FEATURES.map((f) => (
          <Card key={f.title} withBorder radius="md" p="lg">
            <f.icon size={22} />
            <Text fw={600} mt="sm" mb={4}>
              {f.title}
            </Text>
            <Text size="sm" c="dimmed">
              {f.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>

      <Stack gap="xs" mb="md">
        <Group gap="xs">
          <Globe2 size={20} />
          <Title order={2} fz={24}>
            Supported Countries
          </Title>
        </Group>
      </Stack>
      <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 5 }} spacing="sm" mb={64}>
        {countriesQuery.isLoading &&
          Array.from({ length: 12 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} height={45} radius="md" />
          ))}
        {!countriesQuery.isLoading && !countries.length && (
          <Text c="dimmed" size="sm">
            No countries configured yet.
          </Text>
        )}
        {countries.map((c) => (
          <Paper key={c.id} withBorder radius="md" p="xs">
            <Group gap="xs" wrap="nowrap">
              <CountryFlag code={c.code} />
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} truncate>
                  {c.name}
                </Text>
              </div>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>

      <Stack gap="xs" mb="md">
        <Group gap="xs">
          <Bell size={20} />
          <Title order={2} fz={24}>
            Supported Notification Methods
          </Title>
        </Group>
        <Text c="dimmed" size="sm">
          Notifications fire the moment a request comes in. Admins can wire up any combination of channels per
          country or region — see the <Link to="/help">setup guide</Link> for step-by-step instructions.
        </Text>
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {NOTIFICATION_METHODS.map((m) => (
          <Card key={m.label} withBorder radius="md" p="md">
            <Group gap="xs" mb={4}>
              <m.icon size={16} />
              <Text fw={600} size="sm">
                {m.label}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {m.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Container>
  )
}
