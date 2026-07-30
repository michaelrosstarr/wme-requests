import { Badge } from '@mantine/core'
import { Globe, Image, Lock, MessageSquare, Send, Gamepad2, Mail, Webhook } from 'lucide-react'
import type { EventType, Platform, RequestType, Status } from './types'

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
  discord: Gamepad2,
  telegram: Send,
  email: Mail,
  webhook: Webhook,
}

const PLATFORM_LABELS: Record<Platform, string> = {
  slack: 'Slack',
  discord: 'Discord',
  telegram: 'Telegram',
  email: 'Email',
  webhook: 'Webhook',
}

export function PlatformBadge({ platform }: Readonly<{ platform: Platform }>) {
  const Icon = PLATFORM_ICONS[platform]
  return (
    <Badge size="xs" variant="light" leftSection={<Icon size={11} />}>
      {PLATFORM_LABELS[platform]}
    </Badge>
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

export function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}
