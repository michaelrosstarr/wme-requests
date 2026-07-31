import { useEffect } from 'react'
import { Alert, Button, Checkbox, Code, Group, Modal, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { ShieldCheck } from 'lucide-react'
import { useForm } from '@mantine/form'
import { useCreateChannel, useRegions, useUpdateChannel, type ChannelFormValues } from '@/lib/queries'
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
  { value: 'google_sheets', label: 'Google Sheet' },
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
  region_id: null,
  webhook_url: '',
  bot_token: '',
  chat_id: '',
  custom_prefix: '',
  email_to: '',
  discord_forum: false,
  spreadsheet_id: '',
  sheet_name: '',
  google_service_account_json: '',
}

export default function ChannelFormModal({ opened, onClose, countryId, channel }: Readonly<Props>) {
  const isEdit = !!channel
  const create = useCreateChannel()
  const update = useUpdateChannel()
  const regionsQuery = useRegions(countryId)
  const regions = regionsQuery.data ?? []

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
      spreadsheet_id: (v, values) =>
        values.platform === 'google_sheets' && !v ? 'Spreadsheet ID is required' : null,
      google_service_account_json: (v, values) =>
        values.platform === 'google_sheets' && !isEdit && !v ? 'A Google service account key is required' : null,
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
              region_id: channel.region_id,
              webhook_url: channel.webhook_url ?? '',
              bot_token: channel.bot_token ?? '',
              chat_id: channel.chat_id ?? '',
              custom_prefix: channel.custom_prefix ?? '',
              email_to: channel.email_to ?? '',
              discord_forum: !!channel.discord_forum,
              spreadsheet_id: channel.spreadsheet_id ?? '',
              sheet_name: channel.sheet_name ?? '',
              // Never prefilled — the server doesn't return the stored credentials.
              google_service_account_json: '',
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
      region_id: values.region_id,
      webhook_url: usesWebhookUrl ? values.webhook_url?.trim() || null : null,
      bot_token: values.platform === 'telegram' ? values.bot_token?.trim() || null : null,
      chat_id: values.platform === 'telegram' ? values.chat_id?.trim() || null : null,
      custom_prefix: values.custom_prefix?.trim() || null,
      email_to: values.platform === 'email' ? values.email_to?.trim() || null : null,
      discord_forum: values.platform === 'discord' ? values.discord_forum : false,
      spreadsheet_id: values.platform === 'google_sheets' ? values.spreadsheet_id?.trim() || null : null,
      sheet_name: values.platform === 'google_sheets' ? values.sheet_name?.trim() || null : null,
      google_service_account_json:
        values.platform === 'google_sheets' ? values.google_service_account_json?.trim() || null : null,
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
  const isDiscord = platform === 'discord'
  const isGoogleSheets = platform === 'google_sheets'
  const showWebhookUrl = platform === 'slack' || isDiscord || isWebhook
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
          <Select
            label="Region"
            placeholder="Country-wide (all regions)"
            description="Scopes this channel to one region. Requests in a region with no matching channels fall back to the country-wide ones."
            data={regions.map((r) => ({ value: String(r.id), label: `${r.name} (${r.code})` }))}
            value={form.values.region_id != null ? String(form.values.region_id) : null}
            onChange={(v) => form.setFieldValue('region_id', v ? Number(v) : null)}
            disabled={saving || !regions.length}
            clearable
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
          {isDiscord && (
            <Checkbox
              label="Post as a new thread in a Discord Forum channel"
              description="The webhook must point at a Forum channel. Each notification creates a new forum post — Discord doesn't support posting further replies into it via webhook."
              disabled={saving}
              {...form.getInputProps('discord_forum', { type: 'checkbox' })}
            />
          )}
          {isGoogleSheets && (
            <>
              <TextInput
                label="Spreadsheet ID"
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                description="The long ID in the sheet's URL, between /d/ and /edit."
                disabled={saving}
                {...form.getInputProps('spreadsheet_id')}
              />
              <TextInput
                label="Sheet / Tab Name (optional)"
                placeholder="Sheet1"
                description="Defaults to Sheet1 if left blank."
                disabled={saving}
                {...form.getInputProps('sheet_name')}
              />
              {isEdit && channel?.has_google_credentials && (
                <Alert icon={<ShieldCheck size={16} />} color="green" variant="light" py={6}>
                  A service account key is already configured for this channel.
                </Alert>
              )}
              <Textarea
                label={isEdit ? 'Google Service Account Key (optional)' : 'Google Service Account Key'}
                placeholder='{"client_email": "...", "private_key": "...", ...}'
                description={
                  isEdit
                    ? "Paste a new key to replace the one on file, or leave blank to keep it. Stored encrypted — you won't be able to view it again after saving."
                    : "Paste the full contents of the service account's downloaded JSON key file. Stored encrypted — you won't be able to view it again after saving. Share the sheet (Editor access) with this account's client_email."
                }
                autosize
                minRows={3}
                maxRows={8}
                disabled={saving}
                {...form.getInputProps('google_service_account_json')}
              />
            </>
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
