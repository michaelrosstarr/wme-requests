import { useEffect } from 'react'
import { Button, Code, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useCreateChannel, useUpdateChannel, type ChannelFormValues } from '@/lib/queries'
import type { Channel } from '@/lib/types'

interface Props {
  opened: boolean
  onClose: () => void
  countryId: string
  channel?: Channel | null
}

const PLATFORM_OPTIONS = [
  { value: 'slack', label: 'Slack' },
  { value: 'discord', label: 'Discord' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
  { value: 'webhook', label: 'Webhook (generic JSON)' },
]

const EVENT_TYPE_OPTIONS = [
  { value: 'global', label: 'Global (all requests)' },
  { value: 'downlock', label: 'Downlock only' },
  { value: 'imagery', label: 'Imagery only' },
]

const EMPTY_VALUES: ChannelFormValues = {
  label: '',
  platform: 'slack',
  event_type: 'global',
  webhook_url: '',
  bot_token: '',
  chat_id: '',
  custom_prefix: '',
  email_to: '',
}

export default function ChannelFormModal({ opened, onClose, countryId, channel }: Readonly<Props>) {
  const isEdit = !!channel
  const create = useCreateChannel()
  const update = useUpdateChannel()

  const form = useForm<ChannelFormValues>({
    initialValues: EMPTY_VALUES,
    validate: {
      label: (v) => (v.trim() ? null : 'Label is required'),
      webhook_url: (v, values) =>
        (values.platform === 'slack' || values.platform === 'discord' || values.platform === 'webhook') && !v
          ? 'Webhook URL is required'
          : null,
      bot_token: (v, values) => (values.platform === 'telegram' && !v ? 'Bot token is required' : null),
      chat_id: (v, values) => (values.platform === 'telegram' && !v ? 'Chat ID is required' : null),
      email_to: (v, values) => (values.platform === 'email' && !v ? 'Recipient email is required' : null),
    },
  })

  useEffect(() => {
    if (opened) {
      form.setValues(
        channel
          ? {
              label: channel.label,
              platform: channel.platform,
              event_type: channel.event_type,
              webhook_url: channel.webhook_url ?? '',
              bot_token: channel.bot_token ?? '',
              chat_id: channel.chat_id ?? '',
              custom_prefix: channel.custom_prefix ?? '',
              email_to: channel.email_to ?? '',
            }
          : EMPTY_VALUES,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, channel])

  async function handleSubmit(values: ChannelFormValues) {
    const usesWebhookUrl = values.platform === 'slack' || values.platform === 'discord' || values.platform === 'webhook'
    const payload: ChannelFormValues = {
      label: values.label.trim(),
      platform: values.platform,
      event_type: values.event_type,
      webhook_url: usesWebhookUrl ? values.webhook_url?.trim() || null : null,
      bot_token: values.platform === 'telegram' ? values.bot_token?.trim() || null : null,
      chat_id: values.platform === 'telegram' ? values.chat_id?.trim() || null : null,
      custom_prefix: values.custom_prefix?.trim() || null,
      email_to: values.platform === 'email' ? values.email_to?.trim() || null : null,
    }
    try {
      if (isEdit && channel) {
        await update.mutateAsync({ id: channel.id, countryId, ...payload })
      } else {
        await create.mutateAsync({ countryId, ...payload })
      }
      onClose()
    } catch (e) {
      form.setFieldError('label', (e as Error).message)
    }
  }

  const platform = form.values.platform
  const isTelegram = platform === 'telegram'
  const isEmail = platform === 'email'
  const isWebhook = platform === 'webhook'
  const showWebhookUrl = platform === 'slack' || platform === 'discord' || isWebhook
  const saving = create.isPending || update.isPending

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Edit Notification Channel' : 'Add Notification Channel'}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            label="Label"
            placeholder="e.g. #wme-au-downlocks"
            disabled={saving}
            {...form.getInputProps('label')}
          />
          <Select
            label="Platform"
            data={PLATFORM_OPTIONS}
            allowDeselect={false}
            disabled={saving}
            {...form.getInputProps('platform')}
          />
          <Select
            label="Event Type"
            data={EVENT_TYPE_OPTIONS}
            allowDeselect={false}
            disabled={saving}
            {...form.getInputProps('event_type')}
          />
          {showWebhookUrl && (
            <TextInput
              label="Webhook URL"
              placeholder={isWebhook ? 'https://your-service.example.com/hook' : 'https://hooks.slack.com/…'}
              description={isWebhook ? 'Receives a POST with a plain JSON body on every matching request.' : undefined}
              disabled={saving}
              {...form.getInputProps('webhook_url')}
            />
          )}
          {isWebhook && (
            <div>
              <Text size="sm" fw={500} mb={4}>
                Example payload
              </Text>
              <Code block>
                {`{
  "title": "Downlock Request — South Africa",
  "prefix": "L5ZA",
  "permalink": "https://www.waze.com/editor?...",
  "lock_level": 5,
  "notes": "Speed limit needs adjusting",
  "submitted_by": "waze_editor",
  "submitted_by_url": "https://www.waze.com/user/editor/waze_editor",
  "editor_rank": 4
}`}
              </Code>
              <Text size="xs" c="dimmed" mt={4}>
                <code>prefix</code>, <code>lock_level</code>, <code>notes</code>, <code>submitted_by</code>,{' '}
                <code>submitted_by_url</code>, and <code>editor_rank</code> are <code>null</code> when not
                applicable (e.g. <code>lock_level</code> for imagery requests).
              </Text>
            </div>
          )}
          {isTelegram && (
            <>
              <TextInput
                label="Bot Token"
                placeholder="123456:ABC-…"
                disabled={saving}
                {...form.getInputProps('bot_token')}
              />
              <TextInput
                label="Chat ID"
                placeholder="-100123456789"
                disabled={saving}
                {...form.getInputProps('chat_id')}
              />
            </>
          )}
          {isEmail && (
            <TextInput
              label="Recipient Email"
              type="email"
              placeholder="alerts@example.com"
              disabled={saving}
              {...form.getInputProps('email_to')}
            />
          )}
          <TextInput
            label="Custom Prefix (optional)"
            placeholder="e.g. L{lock_level}{country_code}"
            description={
              <>
                Prepended before the permalink on every message. Supports variables: {'{lock_level}'},{' '}
                {'{country_code}'}, {'{country_name}'}, {'{editor_rank}'}, {'{type}'}, {'{submitted_by}'}
              </>
            }
            disabled={saving}
            {...form.getInputProps('custom_prefix')}
          />
          <Group justify="flex-end">
            <Button variant="default" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
