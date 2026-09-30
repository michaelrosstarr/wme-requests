import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Badge, Button, Container, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { KeyRound, LockKeyhole, Plus, Trash2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { SOCIAL_PROVIDERS, type SocialProviderId } from '@/lib/social-providers'

export const Route = createFileRoute('/_protected/account')({ component: Account })

const ACCOUNTS_KEY = ['auth', 'accounts']

function useLinkedAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts()
      if (error) throw new Error(error.message ?? 'Could not load linked accounts')
      return data
    },
  })
}

function Account() {
  const qc = useQueryClient()
  const accountsQuery = useLinkedAccounts()
  const passkeysQuery = authClient.useListPasskeys()
  const [adding, setAdding] = useState(false)
  const [linking, setLinking] = useState<SocialProviderId | null>(null)

  const accounts = accountsQuery.data ?? []
  const passkeys = passkeysQuery.data ?? []
  const hasPassword = accounts.some((a) => a.providerId === 'credential')
  // Better Auth refuses to unlink a user's last account server-side, but that check doesn't
  // know about passkeys — so deleting a passkey is guarded here against removing the last
  // sign-in method of any kind.
  const signInMethods = accounts.length + passkeys.length
  const loaded = !accountsQuery.isPending && !passkeysQuery.isPending

  const unlink = useMutation({
    mutationFn: async (providerId: SocialProviderId) => {
      const { error } = await authClient.unlinkAccount({ providerId })
      if (error) throw new Error(error.message ?? 'Unlink failed')
    },
    onSuccess: () => {
      notifications.show({ color: 'green', message: 'Account unlinked.' })
      qc.invalidateQueries({ queryKey: ACCOUNTS_KEY })
    },
    onError: (e) => notifications.show({ color: 'red', title: 'Unlink failed', message: (e as Error).message }),
  })

  const deletePasskey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id })
      if (error) throw new Error(error.message ?? 'Delete failed')
    },
    onSuccess: () => notifications.show({ color: 'green', message: 'Passkey removed.' }),
    onError: (e) => notifications.show({ color: 'red', title: 'Delete failed', message: (e as Error).message }),
  })

  async function handleAddPasskey() {
    const name = prompt('Name this passkey (optional), e.g. "MacBook" or "Phone":')
    if (name === null) return
    setAdding(true)
    const { error } = await authClient.passkey.addPasskey({ name: name.trim() || undefined })
    setAdding(false)
    if (error) {
      notifications.show({ color: 'red', title: 'Could not add passkey', message: error.message ?? 'Unknown error' })
      return
    }
    notifications.show({ color: 'green', message: 'Passkey added.' })
    passkeysQuery.refetch()
  }

  function handleDeletePasskey(id: string) {
    if (!confirm('Remove this passkey? You will no longer be able to sign in with it.')) return
    deletePasskey.mutate(id)
  }

  function handleUnlink(providerId: SocialProviderId, label: string) {
    if (!confirm(`Unlink your ${label} account?`)) return
    unlink.mutate(providerId)
  }

  async function handleLink(providerId: SocialProviderId, label: string) {
    setLinking(providerId)
    const { error } = await authClient.linkSocial({ provider: providerId, callbackURL: '/account' })
    if (error) {
      setLinking(null)
      notifications.show({ color: 'red', title: `Could not connect ${label}`, message: error.message ?? 'Unknown error' })
    }
  }

  return (
    <Container size="md" pb="xl">
      <Stack gap="md">
        <div>
          <Title order={3}>Account</Title>
          <Text size="sm" c="dimmed">
            Manage how you sign in. Keep at least one sign-in method so you don't lock yourself out.
          </Text>
        </div>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <KeyRound size={16} />
              <Text fw={600}>Passkeys</Text>
            </Group>
            <Button size="xs" leftSection={<Plus size={14} />} loading={adding} onClick={handleAddPasskey}>
              Add passkey
            </Button>
          </Group>
          {passkeysQuery.error && (
            <Alert color="red" title="Could not load passkeys" mb="sm">
              {passkeysQuery.error.message}
            </Alert>
          )}
          {passkeysQuery.isPending ? (
            <Loader size="sm" />
          ) : passkeys.length === 0 ? (
            <Text size="sm" c="dimmed">
              No passkeys yet. Add one to sign in with Touch ID, Windows Hello, your phone, or a security key.
            </Text>
          ) : (
            <Stack gap="xs">
              {passkeys.map((pk) => (
                <Group key={pk.id} justify="space-between" wrap="nowrap">
                  <div>
                    <Text size="sm">{pk.name || 'Unnamed passkey'}</Text>
                    {pk.createdAt && (
                      <Text size="xs" c="dimmed">
                        Added {new Date(pk.createdAt).toLocaleDateString()}
                      </Text>
                    )}
                  </div>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    leftSection={<Trash2 size={14} />}
                    disabled={!loaded || signInMethods < 2}
                    loading={deletePasskey.isPending && deletePasskey.variables === pk.id}
                    onClick={() => handleDeletePasskey(pk.id)}
                  >
                    Delete
                  </Button>
                </Group>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Text fw={600} mb="sm">
            Connected accounts
          </Text>
          {accountsQuery.isError && (
            <Alert color="red" title="Could not load linked accounts" mb="sm">
              {(accountsQuery.error as Error).message}
            </Alert>
          )}
          {accountsQuery.isPending ? (
            <Loader size="sm" />
          ) : (
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs">
                  <LockKeyhole size={16} />
                  <Text size="sm">Password</Text>
                </Group>
                {hasPassword ? (
                  <Badge color="green" variant="light">
                    Set
                  </Badge>
                ) : (
                  <Badge color="gray" variant="light">
                    Not set
                  </Badge>
                )}
              </Group>
              {SOCIAL_PROVIDERS.map(({ id, label, icon: Icon }) => {
                const linked = accounts.some((a) => a.providerId === id)
                return (
                  <Group key={id} justify="space-between" wrap="nowrap">
                    <Group gap="xs">
                      <Icon size={16} />
                      <Text size="sm">{label}</Text>
                      {linked && (
                        <Badge color="green" variant="light">
                          Connected
                        </Badge>
                      )}
                    </Group>
                    {linked ? (
                      <Button
                        size="xs"
                        variant="default"
                        // Server-side, Better Auth also refuses to unlink the last account.
                        disabled={!loaded || accounts.length < 2}
                        loading={unlink.isPending && unlink.variables === id}
                        onClick={() => handleUnlink(id, label)}
                      >
                        Unlink
                      </Button>
                    ) : (
                      <Button size="xs" loading={linking === id} onClick={() => handleLink(id, label)}>
                        Connect
                      </Button>
                    )}
                  </Group>
                )
              })}
            </Stack>
          )}
        </Paper>
      </Stack>
    </Container>
  )
}
