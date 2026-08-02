import { Badge, Group, Text } from '@mantine/core'
import {
  Globe,
  Image,
  Lock,
  MessageSquare,
  MessageCircle,
  Send,
  Gamepad2,
  Mail,
  Webhook,
  FileSpreadsheet,
  Radio,
  Server,
} from 'lucide-react'
import type { CredentialType, EventType, Platform, RequestType, Status } from './types'

export function TypeBadge({ type }: Readonly<{ type: RequestType }>) {
  return type === 'downlock' ? (
    <Badge color="red" variant="light" leftSection={<Lock size={12} />}>
      Downlock
    </Badge>
  ) : (
    <Badge color="blue" variant="light" leftSection={<Image size={12} />}>
      Imagery
    </Badge>
  )
}

const STATUS_COLORS: Record<Status, string> = {
  pending: 'yellow',
  in_progress: 'blue',
  completed: 'green',
  rejected: 'red',
}

export const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  rejected: 'Rejected',
}

export const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as Status[]).map((value) => ({
  value,
  label: STATUS_LABELS[value],
}))

export function StatusBadge({ status }: Readonly<{ status: Status }>) {
  return (
    <Badge color={STATUS_COLORS[status]} variant="light">
      {STATUS_LABELS[status]}
    </Badge>
  )
}

const PLATFORM_ICONS: Record<Platform, typeof MessageSquare> = {
  slack: MessageSquare,
  slack_threaded: MessageSquare,
  discord: Gamepad2,
  telegram: Send,
  email: Mail,
  webhook: Webhook,
  google_sheets: FileSpreadsheet,
  google_chat: MessageCircle,
  ntfy: Radio,
  gotify: Server,
}

const PLATFORM_LABELS: Record<Platform, string> = {
  slack: 'Slack',
  slack_threaded: 'Slack (Threaded)',
  discord: 'Discord',
  telegram: 'Telegram',
  email: 'Email',
  webhook: 'Webhook',
  google_sheets: 'Google Sheet',
  google_chat: 'Google Chat',
  ntfy: 'ntfy',
  gotify: 'Gotify',
}

export function PlatformBadge({ platform }: Readonly<{ platform: Platform }>) {
  const Icon = PLATFORM_ICONS[platform]
  return (
    <Group gap="xs" mb={4}>
      <Icon size={14} />
      <Text fw={600} size="sm">
        {PLATFORM_LABELS[platform]}
      </Text>
    </Group>
  )
}

const EVENT_TYPE_ICONS: Record<EventType, typeof Globe> = {
  global: Globe,
  downlock: Lock,
  imagery: Image,
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  global: 'Global',
  downlock: 'Downlock only',
  imagery: 'Imagery only',
}

export function EventTypeBadge({ eventType }: Readonly<{ eventType: EventType }>) {
  const Icon = EVENT_TYPE_ICONS[eventType]
  return (
    <Badge size="xs" variant="light" leftSection={<Icon size={11} />}>
      {EVENT_TYPE_LABELS[eventType]}
    </Badge>
  )
}

const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  google_service_account: 'Google Service Account',
  email_postmark: 'Postmark',
  email_mailgun: 'Mailgun',
  email_smtp: 'SMTP',
}

export function CredentialTypeBadge({ type }: Readonly<{ type: CredentialType }>) {
  const color = type === 'google_service_account' ? 'blue' : 'grape'
  return (
    <Badge size="xs" variant="light" color={color}>
      {CREDENTIAL_TYPE_LABELS[type]}
    </Badge>
  )
}

export function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}
