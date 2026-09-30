import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  PinInput,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Mail, Plus, ShieldCheck, Smartphone, Trash2, Usb } from 'lucide-react'
import QRCode from 'react-qr-code'
import { authClient } from '@/lib/auth-client'
import { SECURITY_ACTIVITY_KEY } from '@/components/SecurityActivity'
import { confirmDialog, promptDialog } from '@/lib/dialogs'

const STATUS_KEY = ['auth', 'two-factor']
const KEYS_KEY = ['auth', 'security-keys']

// Every modal flow starts by asking for the password (the two-factor plugin requires it for
// enable/disable/backup codes), then walks through its own steps.
type Flow =
  | { kind: 'enable'; step: 'password' | 'code' | 'codes'; backupCodes?: string[] }
  | { kind: 'totp'; step: 'password' | 'scan' | 'codes'; totpURI?: string; backupCodes?: string[] }
  | { kind: 'backup'; step: 'password' | 'codes'; backupCodes?: string[] }
  | { kind: 'disable'; step: 'password' }

const FLOW_TITLES: Record<Flow['kind'], string> = {
  enable: 'Turn on two-factor authentication',
  totp: 'Set up an authenticator app',
  backup: 'Generate new backup codes',
  disable: 'Turn off two-factor authentication',
}

function unwrap<T>({ data, error }: { data: T | null; error: { message?: string } | null }, fallback: string): T {
  if (error) throw new Error(error.message ?? fallback)
  return data as T
}

export default function TwoFactorSettings({ hasPassword }: { hasPassword: boolean }) {
  const qc = useQueryClient()
  const [flow, setFlow] = useState<Flow | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [flowError, setFlowError] = useState<string | null>(null)
  const [addingKey, setAddingKey] = useState(false)

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => unwrap(await authClient.twoFactorStatus(), 'Could not load 2FA status'),
  })
  const enabled = !!status.data?.enabled
  const keys = useQuery({
    queryKey: KEYS_KEY,
    queryFn: async () => unwrap(await authClient.securityKey.list(), 'Could not load security keys'),
    enabled,
  })

  const deleteKey = useMutation({
    mutationFn: async (id: string) => unwrap(await authClient.securityKey.delete({ id }), 'Delete failed'),
    onSuccess: () => {
      notifications.show({ color: 'green', message: 'Security key removed.' })
      qc.invalidateQueries({ queryKey: KEYS_KEY })
      qc.invalidateQueries({ queryKey: SECURITY_ACTIVITY_KEY })
    },
    onError: (e) => notifications.show({ color: 'red', title: 'Delete failed', message: (e as Error).message }),
  })

  function openFlow(next: Flow) {
    setFlow(next)
    setPassword('')
    setCode('')
    setFlowError(null)
  }

  function closeFlow() {
    setFlow(null)
    setPassword('')
    setCode('')
    qc.invalidateQueries({ queryKey: STATUS_KEY })
    qc.invalidateQueries({ queryKey: SECURITY_ACTIVITY_KEY })
  }

  async function step(fn: () => Promise<void>) {
    setFlowError(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setFlowError((e as Error).message)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!flow) return
    void step(async () => {
      if (flow.kind === 'enable') {
        // Creates the 2FA record (an unverified app secret + backup codes) without turning 2FA on;
        // confirming an emailed code is what switches it on.
        const { backupCodes } = unwrap(await authClient.twoFactor.enable({ password }), 'Could not start setup')
        unwrap(await authClient.twoFactor.sendOtp(), 'Could not send the code')
        setFlow({ kind: 'enable', step: 'code', backupCodes })
      } else if (flow.kind === 'totp') {
        // Re-running enable issues a fresh app secret (unverified until a code is confirmed) and
        // fresh backup codes; email codes keep working throughout.
        const { totpURI, backupCodes } = unwrap(
          await authClient.twoFactor.enable({ password }),
          'Could not start setup',
        )
        setFlow({ kind: 'totp', step: 'scan', totpURI, backupCodes })
      } else if (flow.kind === 'backup') {
        const { backupCodes } = unwrap(
          await authClient.twoFactor.generateBackupCodes({ password }),
          'Could not generate backup codes',
        )
        setFlow({ kind: 'backup', step: 'codes', backupCodes })
      } else {
        unwrap(await authClient.twoFactor.disable({ password }), 'Could not turn off 2FA')
        notifications.show({ color: 'green', message: 'Two-factor authentication is off.' })
        closeFlow()
      }
      setPassword('')
    })
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!flow) return
    void step(async () => {
      if (flow.kind === 'enable') {
        unwrap(await authClient.twoFactor.verifyOtp({ code }), 'Invalid code')
        setFlow({ ...flow, step: 'codes' })
      } else if (flow.kind === 'totp') {
        unwrap(await authClient.twoFactor.verifyTotp({ code }), 'Invalid code')
        setFlow({ ...flow, step: 'codes' })
      }
      setCode('')
    })
  }

  async function handleAddKey() {
    const name = await promptDialog({
      title: 'Add security key',
      label: 'Name (optional)',
      description: 'Your browser will ask you to insert or tap the key after this.',
      placeholder: 'e.g. YubiKey 5C',
      confirmLabel: 'Continue',
    })
    if (name === null) return
    setAddingKey(true)
    const { error } = await authClient.securityKeyCeremony.register(name.trim() || undefined)
    setAddingKey(false)
    if (error) {
      notifications.show({ color: 'red', title: 'Could not add security key', message: error.message })
      return
    }
    notifications.show({ color: 'green', message: 'Security key added.' })
    qc.invalidateQueries({ queryKey: KEYS_KEY })
    qc.invalidateQueries({ queryKey: SECURITY_ACTIVITY_KEY })
  }

  async function handleDeleteKey(id: string) {
    const ok = await confirmDialog({
      title: 'Remove security key',
      message: 'You will no longer be able to use this key as your second step when signing in.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    deleteKey.mutate(id)
  }

  const secret = flow?.kind === 'totp' && flow.totpURI ? new URL(flow.totpURI).searchParams.get('secret') : null
  const backupCodes = flow && 'backupCodes' in flow && flow.step === 'codes' ? flow.backupCodes : undefined

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <ShieldCheck size={16} />
          <Text fw={600}>Two-factor authentication</Text>
          {status.data && (
            <Badge color={enabled ? 'green' : 'gray'} variant="light">
              {enabled ? 'On' : 'Off'}
            </Badge>
          )}
        </Group>
        {status.data &&
          (enabled ? (
            <Button size="xs" variant="default" onClick={() => openFlow({ kind: 'disable', step: 'password' })}>
              Turn off
            </Button>
          ) : (
            <Button size="xs" disabled={!hasPassword} onClick={() => openFlow({ kind: 'enable', step: 'password' })}>
              Turn on
            </Button>
          ))}
      </Group>

      {status.isError && (
        <Alert color="red" title="Could not load 2FA status" mb="sm">
          {(status.error as Error).message}
        </Alert>
      )}

      {status.isPending ? (
        <Loader size="sm" />
      ) : !enabled ? (
        <Text size="sm" c="dimmed">
          {hasPassword
            ? 'Ask for a second step — a code from your email or an authenticator app, or a security key — after your password when signing in.'
            : 'Two-factor authentication protects password sign-in. Set a password first (use "Forgot password?" on the sign-in page) to turn it on.'}
        </Text>
      ) : (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            After your password, you'll be asked for one of the following. Passkey and linked-account sign-in aren't
            affected.
          </Text>

          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs">
              <Mail size={16} />
              <Text size="sm">Email codes</Text>
            </Group>
            <Badge color="green" variant="light">
              On
            </Badge>
          </Group>

          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs">
              <Smartphone size={16} />
              <Text size="sm">Authenticator app</Text>
            </Group>
            {status.data?.totp ? (
              <Badge color="green" variant="light">
                On
              </Badge>
            ) : (
              <Button size="xs" variant="default" onClick={() => openFlow({ kind: 'totp', step: 'password' })}>
                Set up
              </Button>
            )}
          </Group>

          <div>
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs">
                <Usb size={16} />
                <Text size="sm">Security keys</Text>
              </Group>
              <Button
                size="xs"
                variant="default"
                leftSection={<Plus size={14} />}
                loading={addingKey}
                onClick={handleAddKey}
              >
                Add security key
              </Button>
            </Group>
            {keys.isPending ? (
              <Loader size="xs" mt="xs" />
            ) : (
              <Stack gap={4} mt="xs" pl="lg">
                {keys.data?.length ? (
                  keys.data.map((k) => (
                    <Group key={k.id} justify="space-between" wrap="nowrap">
                      <div>
                        <Text size="sm">{k.name || 'Unnamed security key'}</Text>
                        <Text size="xs" c="dimmed">
                          Added {new Date(k.createdAt).toLocaleDateString()}
                        </Text>
                      </div>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        leftSection={<Trash2 size={14} />}
                        loading={deleteKey.isPending && deleteKey.variables === k.id}
                        onClick={() => handleDeleteKey(k.id)}
                      >
                        Delete
                      </Button>
                    </Group>
                  ))
                ) : (
                  <Text size="xs" c="dimmed">
                    None yet — add a hardware key like a YubiKey to approve sign-ins with a tap.
                  </Text>
                )}
              </Stack>
            )}
          </div>

          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">Backup codes</Text>
            <Button size="xs" variant="default" onClick={() => openFlow({ kind: 'backup', step: 'password' })}>
              Generate new codes
            </Button>
          </Group>
        </Stack>
      )}

      <Modal
        opened={!!flow}
        onClose={closeFlow}
        title={flow ? FLOW_TITLES[flow.kind] : ''}
        // Backup codes are shown exactly once — don't let a stray click dismiss them.
        closeOnClickOutside={flow?.step !== 'codes'}
      >
        {flow && (
          <Stack>
            {flowError && (
              <Alert color="red" title="Something went wrong">
                {flowError}
              </Alert>
            )}

            {flow.step === 'password' && (
              <form onSubmit={handlePasswordSubmit}>
                <Stack>
                  <Text size="sm">Confirm your password to continue.</Text>
                  <PasswordInput
                    label="Password"
                    required
                    autoFocus
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                  />
                  <Button type="submit" loading={busy} color={flow.kind === 'disable' ? 'red' : undefined}>
                    {flow.kind === 'disable' ? 'Turn off 2FA' : 'Continue'}
                  </Button>
                </Stack>
              </form>
            )}

            {(flow.step === 'code' || flow.step === 'scan') && (
              <form onSubmit={handleCodeSubmit}>
                <Stack align="stretch">
                  {flow.kind === 'totp' && flow.totpURI ? (
                    <>
                      <Text size="sm">
                        Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy, …), then
                        enter the 6-digit code it shows.
                      </Text>
                      <Group justify="center">
                        <Paper p="sm" bg="white" radius="sm">
                          <QRCode value={flow.totpURI} size={180} />
                        </Paper>
                      </Group>
                      {secret && (
                        <Text size="xs" c="dimmed" ta="center">
                          Can't scan? Enter this key manually: <Code>{secret}</Code>
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text size="sm">
                      We emailed you a 6-digit code. Enter it below to turn on 2FA — it expires in 3 minutes.
                    </Text>
                  )}
                  <Group justify="center">
                    <PinInput length={6} type="number" oneTimeCode autoFocus value={code} onChange={setCode} />
                  </Group>
                  <Button type="submit" loading={busy} disabled={code.length !== 6}>
                    Verify
                  </Button>
                </Stack>
              </form>
            )}

            {flow.step === 'codes' && backupCodes && (
              <>
                {flow.kind !== 'backup' && (
                  <Alert color="green" title={flow.kind === 'enable' ? '2FA is on' : 'Authenticator app added'}>
                    {flow.kind === 'enable'
                      ? "You'll be asked for a code after your password from now on."
                      : 'You can now use codes from your app when signing in.'}
                  </Alert>
                )}
                <Text size="sm">
                  Save these backup codes somewhere safe. Each one signs you in once if you can't use your other
                  methods.{flow.kind !== 'enable' && ' Any previous backup codes no longer work.'} They won't be shown
                  again.
                </Text>
                <SimpleGrid cols={2} spacing="xs">
                  {backupCodes.map((c) => (
                    <Code key={c} ta="center">
                      {c}
                    </Code>
                  ))}
                </SimpleGrid>
                <Group grow>
                  <CopyButton value={backupCodes.join('\n')}>
                    {({ copied, copy }) => (
                      <Button variant="default" onClick={copy}>
                        {copied ? 'Copied' : 'Copy codes'}
                      </Button>
                    )}
                  </CopyButton>
                  <Button onClick={closeFlow}>Done</Button>
                </Group>
              </>
            )}
          </Stack>
        )}
      </Modal>
    </Paper>
  )
}
