import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Group, Modal, NumberInput, PasswordInput, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { ShieldCheck } from 'lucide-react'
import { useForm } from '@mantine/form'
import { useCreateCredential, useUpdateCredential } from '@/lib/queries'
import type { Credential, CredentialType } from '@/lib/types'

interface Props {
  opened: boolean
  onClose: () => void
  // 'google' locks the type to google_service_account (the shared pool); 'email' lets the
  // user pick which provider this credential is for.
  kind: 'google' | 'email'
  credential?: Credential | null
}

const EMAIL_PROVIDER_OPTIONS = [
  { value: 'email_postmark', label: 'Postmark' },
  { value: 'email_mailgun', label: 'Mailgun' },
  { value: 'email_smtp', label: 'SMTP' },
]

interface FormValues {
  type: CredentialType
  label: string
  service_account_json: string
  serverToken: string
  apiKey: string
  domain: string
  host: string
  port: string
  secure: boolean
  username: string
  password: string
  fromEmail: string
}

const EMPTY_VALUES: FormValues = {
  type: 'email_postmark',
  label: '',
  service_account_json: '',
  serverToken: '',
  apiKey: '',
  domain: '',
  host: '',
  port: '587',
  secure: false,
  username: '',
  password: '',
  fromEmail: '',
}

function buildPayload(values: FormValues): Record<string, unknown> | null {
  if (values.type === 'google_service_account') {
    try {
      const parsed = JSON.parse(values.service_account_json)
      if (!parsed.client_email || !parsed.private_key) return null
      return parsed
    } catch {
      return null
    }
  }
  if (values.type === 'email_postmark') return { serverToken: values.serverToken, fromEmail: values.fromEmail }
  if (values.type === 'email_mailgun')
    return { apiKey: values.apiKey, domain: values.domain, fromEmail: values.fromEmail }
  return {
    host: values.host,
    port: Number(values.port),
    secure: values.secure,
    username: values.username,
    password: values.password,
    fromEmail: values.fromEmail,
  }
}

export default function CredentialsModal({ opened, onClose, kind, credential }: Readonly<Props>) {
  const isEdit = !!credential
  const [replaceSecret, setReplaceSecret] = useState(!isEdit)
  const create = useCreateCredential()
  const update = useUpdateCredential()

  const form = useForm<FormValues>({
    initialValues: EMPTY_VALUES,
    validate: {
      label: (v) => (v.trim() ? null : 'Label is required'),
      service_account_json: (_v, values) =>
        replaceSecret && values.type === 'google_service_account' && !buildPayload(values)
          ? 'Paste valid JSON including client_email and private_key'
          : null,
      serverToken: (v, values) =>
        replaceSecret && values.type === 'email_postmark' && !v ? 'Server token is required' : null,
      apiKey: (v, values) => (replaceSecret && values.type === 'email_mailgun' && !v ? 'API key is required' : null),
      domain: (v, values) => (replaceSecret && values.type === 'email_mailgun' && !v ? 'Domain is required' : null),
      host: (v, values) => (replaceSecret && values.type === 'email_smtp' && !v ? 'Host is required' : null),
      username: (v, values) => (replaceSecret && values.type === 'email_smtp' && !v ? 'Username is required' : null),
      password: (v, values) => (replaceSecret && values.type === 'email_smtp' && !v ? 'Password is required' : null),
      fromEmail: (v, values) =>
        replaceSecret && values.type !== 'google_service_account' && !v ? 'From email is required' : null,
    },
  })

  useEffect(() => {
    if (!opened) return
    setReplaceSecret(!credential)
    form.setValues(
      credential
        ? { ...EMPTY_VALUES, type: credential.type, label: credential.label }
        : { ...EMPTY_VALUES, type: kind === 'google' ? 'google_service_account' : 'email_postmark' },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, credential, kind])

  async function handleSubmit(values: FormValues) {
    const payload = replaceSecret ? buildPayload(values) : undefined
    try {
      if (isEdit && credential) {
        await update.mutateAsync({ id: credential.id, label: values.label.trim(), ...(payload ? { payload } : {}) })
      } else {
        await create.mutateAsync({ type: values.type, label: values.label.trim(), payload: payload! })
      }
      onClose()
    } catch (e) {
      form.setFieldError('label', (e as Error).message)
    }
  }

  const saving = create.isPending || update.isPending
  const type = form.values.type
  const alreadyConfigured = isEdit && !replaceSecret

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Edit Credential' : kind === 'google' ? 'Add Google Service Account' : 'Add Email Credential'}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            label="Label"
            placeholder={kind === 'google' ? 'e.g. Reporting service account' : 'e.g. My Postmark account'}
            disabled={saving}
            {...form.getInputProps('label')}
          />

          {kind === 'email' && !isEdit && (
            <Select
              label="Provider"
              data={EMAIL_PROVIDER_OPTIONS}
              allowDeselect={false}
              disabled={saving}
              {...form.getInputProps('type')}
            />
          )}

          {alreadyConfigured && (
            <Alert icon={<ShieldCheck size={16} />} color="green" variant="light" py={6}>
              Credentials are already configured. Check "Replace" below to change them.
            </Alert>
          )}
          {isEdit && (
            <Checkbox
              label="Replace stored credentials"
              checked={replaceSecret}
              onChange={(e) => setReplaceSecret(e.currentTarget.checked)}
              disabled={saving}
            />
          )}

          {replaceSecret && type === 'google_service_account' && (
            <Textarea
              label="Google Service Account Key"
              placeholder='{"client_email": "...", "private_key": "...", ...}'
              description="Paste the full contents of the service account's downloaded JSON key file. Stored encrypted — you won't be able to view it again after saving."
              autosize
              minRows={3}
              maxRows={8}
              disabled={saving}
              {...form.getInputProps('service_account_json')}
            />
          )}

          {replaceSecret && type === 'email_postmark' && (
            <>
              <PasswordInput label="Server API Token" disabled={saving} {...form.getInputProps('serverToken')} />
              <TextInput label="From Email" type="email" disabled={saving} {...form.getInputProps('fromEmail')} />
            </>
          )}

          {replaceSecret && type === 'email_mailgun' && (
            <>
              <PasswordInput label="API Key" disabled={saving} {...form.getInputProps('apiKey')} />
              <TextInput label="Domain" placeholder="mail.example.com" disabled={saving} {...form.getInputProps('domain')} />
              <TextInput label="From Email" type="email" disabled={saving} {...form.getInputProps('fromEmail')} />
            </>
          )}

          {replaceSecret && type === 'email_smtp' && (
            <>
              <TextInput label="Host" placeholder="smtp.example.com" disabled={saving} {...form.getInputProps('host')} />
              <Group grow>
                <NumberInput
                  label="Port"
                  min={1}
                  max={65535}
                  disabled={saving}
                  value={Number(form.values.port) || undefined}
                  onChange={(v) => form.setFieldValue('port', String(v ?? ''))}
                />
                <Checkbox
                  mt={24}
                  label="Use TLS (implicit)"
                  disabled={saving}
                  {...form.getInputProps('secure', { type: 'checkbox' })}
                />
              </Group>
              <TextInput label="Username" disabled={saving} {...form.getInputProps('username')} />
              <PasswordInput label="Password" disabled={saving} {...form.getInputProps('password')} />
              <TextInput label="From Email" type="email" disabled={saving} {...form.getInputProps('fromEmail')} />
            </>
          )}

          {kind === 'google' && (
            <Text size="xs" c="dimmed">
              Share the target spreadsheet (Editor access) with this account's client_email.
            </Text>
          )}

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
