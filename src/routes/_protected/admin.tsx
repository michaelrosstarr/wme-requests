import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Alert, Badge, Button, Card, Container, Group, SimpleGrid, Select, Stack, Table, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Globe, Info, KeyRound, Mail, Pencil, Plus, Send, Trash2, UserPlus } from 'lucide-react'
import {
  useChannels,
  useCountries,
  useDeleteChannel,
  useDeleteCountry,
  useMe,
  useResetUserPassword,
  useTestChannel,
  useUsers,
} from '@/lib/queries'
import { EventTypeBadge, PlatformBadge } from '@/lib/labels'
import type { AdminUser, Channel, Country } from '@/lib/types'
import CountryFormModal from '@/components/CountryFormModal'
import ChannelFormModal from '@/components/ChannelFormModal'
import UserFormModal from '@/components/UserFormModal'
import InviteUserModal from '@/components/InviteUserModal'
import UserAccessModal from '@/components/UserAccessModal'

export const Route = createFileRoute('/_protected/admin')({ component: Admin })

function Admin() {
  const me = useMe().data
  const countriesQuery = useCountries()
  const countries = countriesQuery.data ?? []
  const countryLabel = (id: number) => countries.find((c) => c.id === id)?.code ?? `#${id}`

  const [countryModal, setCountryModal] = useState<{ opened: boolean; country: Country | null }>({
    opened: false,
    country: null,
  })
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null)
  const [channelModal, setChannelModal] = useState<{ opened: boolean; channel: Channel | null }>({
    opened: false,
    channel: null,
  })

  const channelsQuery = useChannels(selectedCountryId)
  const deleteCountry = useDeleteCountry()
  const deleteChannel = useDeleteChannel()
  const testChannel = useTestChannel()

  const usersQuery = useUsers()
  const users = usersQuery.data ?? []
  const [userModal, setUserModal] = useState(false)
  const [inviteModal, setInviteModal] = useState(false)
  const [accessModal, setAccessModal] = useState<{ opened: boolean; user: AdminUser | null }>({
    opened: false,
    user: null,
  })
  const resetUserPassword = useResetUserPassword()

  function handleDeleteCountry(id: number) {
    if (!confirm('Delete this country and all its channels and requests?')) return
    deleteCountry.mutate(id, {
      onError: (e) => notifications.show({ color: 'red', title: 'Delete failed', message: (e as Error).message }),
    })
  }

  function handleAddChannel() {
    if (!countries.length) {
      notifications.show({ color: 'yellow', message: 'Add a country first.' })
      return
    }
    if (!selectedCountryId) {
      notifications.show({ color: 'yellow', message: 'Select a country first.' })
      return
    }
    setChannelModal({ opened: true, channel: null })
  }

  function handleDeleteChannel(id: number) {
    if (!selectedCountryId) return
    if (!confirm('Delete this channel?')) return
    deleteChannel.mutate(
      { id, countryId: selectedCountryId },
      {
        onError: (e) => notifications.show({ color: 'red', title: 'Delete failed', message: (e as Error).message }),
      },
    )
  }

  function handleTestChannel(id: number) {
    testChannel.mutate(id, {
      onSuccess: () => notifications.show({ color: 'green', message: 'Test notification sent.' }),
      onError: (e) =>
        notifications.show({ color: 'red', title: 'Test notification failed', message: (e as Error).message }),
    })
  }

  function handleResetPassword(id: string, email: string) {
    if (!confirm(`Send a password reset email to ${email}?`)) return
    resetUserPassword.mutate(id, {
      onSuccess: () => notifications.show({ color: 'green', message: `Reset email sent to ${email}.` }),
      onError: (e) => notifications.show({ color: 'red', title: 'Reset failed', message: (e as Error).message }),
    })
  }

  return (
    <Container size="xl" pb="xl">
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" p="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Countries</Title>
            {me?.isGlobal && (
              <Button size="xs" leftSection={<Plus size={14} />} onClick={() => setCountryModal({ opened: true, country: null })}>
                Add
              </Button>
            )}
          </Group>
          <Stack gap="xs">
            {countriesQuery.isLoading && <Text c="dimmed">Loading…</Text>}
            {!countriesQuery.isLoading && !countries.length && <Text c="dimmed">No countries yet.</Text>}
            {countries.map((c) => (
              <Card key={c.id} withBorder radius="sm" p="xs">
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>{c.name}</Text>
                    <Text size="xs" c="dimmed">
                      {c.code}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<Pencil size={14} />}
                      onClick={() => setCountryModal({ opened: true, country: c })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      leftSection={<Trash2 size={14} />}
                      onClick={() => handleDeleteCountry(c.id)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </Card>

        <Card withBorder radius="md" p="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Notification Channels</Title>
            <Button size="xs" leftSection={<Plus size={14} />} onClick={handleAddChannel}>
              Add
            </Button>
          </Group>
          <Alert icon={<Info size={16} />} variant="light" mb="sm" title="Custom Prefix variables">
            <Text size="xs" mb={4}>
              A channel's Custom Prefix supports these variables, substituted per-request when a message is sent:
            </Text>
            <Table withRowBorders={false} verticalSpacing={2} fz="xs">
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>
                    <code>{'{lock_level}'}</code>
                  </Table.Td>
                  <Table.Td>Request's lock level (empty for imagery)</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <code>{'{country_code}'}</code>
                  </Table.Td>
                  <Table.Td>Channel's country code, e.g. ZA</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <code>{'{country_name}'}</code>
                  </Table.Td>
                  <Table.Td>Channel's country name, e.g. South Africa</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <code>{'{editor_rank}'}</code>
                  </Table.Td>
                  <Table.Td>Submitter's WME editor rank</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <code>{'{type}'}</code>
                  </Table.Td>
                  <Table.Td>downlock or imagery</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <code>{'{submitted_by}'}</code>
                  </Table.Td>
                  <Table.Td>Submitter's Waze username</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
            <Text size="xs" mt={4} c="dimmed">
              Example: a downlock channel's prefix <code>L{'{lock_level}'}{'{country_code}'}</code> renders{' '}
              <code>L5ZA</code> for a lock-5 South Africa request.
            </Text>
          </Alert>
          <Select
            label="Country"
            placeholder="Select a country…"
            data={countries.map((c) => ({ value: String(c.id), label: `${c.name} (${c.code})` }))}
            value={selectedCountryId}
            onChange={setSelectedCountryId}
            mb="sm"
            clearable
          />
          <Stack gap="xs">
            {!selectedCountryId && <Text c="dimmed">Select a country to see channels</Text>}
            {selectedCountryId && channelsQuery.isLoading && <Text c="dimmed">Loading…</Text>}
            {selectedCountryId && channelsQuery.data && !channelsQuery.data.length && (
              <Text c="dimmed">No channels configured for this country.</Text>
            )}
            {channelsQuery.data?.map((ch) => (
              <Card key={ch.id} withBorder radius="sm" p="xs">
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>{ch.label}</Text>
                    <Group gap={4} mt={4}>
                      <PlatformBadge platform={ch.platform} />
                      <EventTypeBadge eventType={ch.event_type} />
                    </Group>
                  </div>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<Send size={14} />}
                      loading={testChannel.isPending && testChannel.variables === ch.id}
                      onClick={() => handleTestChannel(ch.id)}
                    >
                      Test
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<Pencil size={14} />}
                      onClick={() => setChannelModal({ opened: true, channel: ch })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      leftSection={<Trash2 size={14} />}
                      onClick={() => handleDeleteChannel(ch.id)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </Card>
      </SimpleGrid>

      {me?.isGlobal && (
        <Card withBorder radius="md" p="md" mt="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Users</Title>
            <Group gap="xs">
              <Button size="xs" variant="light" leftSection={<Mail size={14} />} onClick={() => setInviteModal(true)}>
                Invite
              </Button>
              <Button size="xs" leftSection={<UserPlus size={14} />} onClick={() => setUserModal(true)}>
                Create
              </Button>
            </Group>
          </Group>
          <Stack gap="xs">
            {usersQuery.isLoading && <Text c="dimmed">Loading…</Text>}
            {!usersQuery.isLoading && !users.length && <Text c="dimmed">No users yet.</Text>}
            {users.map((u) => (
              <Card key={u.id} withBorder radius="sm" p="xs">
                <Group justify="space-between">
                  <div>
                    <Group gap={6}>
                      <Text fw={600}>{u.name}</Text>
                      {!u.hasPassword && (
                        <Badge size="xs" color="yellow" variant="light">
                          Invite pending
                        </Badge>
                      )}
                      {u.isGlobal ? (
                        <Badge size="xs" color="blue" variant="light" leftSection={<Globe size={10} />}>
                          Global
                        </Badge>
                      ) : (
                        <Badge size="xs" color="gray" variant="light">
                          {u.countryIds.length
                            ? u.countryIds.map(countryLabel).join(', ')
                            : 'No countries assigned'}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {u.email}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<Pencil size={14} />}
                      onClick={() => setAccessModal({ opened: true, user: u })}
                    >
                      Edit Access
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<KeyRound size={14} />}
                      loading={resetUserPassword.isPending && resetUserPassword.variables === u.id}
                      onClick={() => handleResetPassword(u.id, u.email)}
                    >
                      Reset Password
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </Card>
      )}

      <CountryFormModal
        opened={countryModal.opened}
        country={countryModal.country}
        onClose={() => setCountryModal({ opened: false, country: null })}
      />
      {selectedCountryId && (
        <ChannelFormModal
          opened={channelModal.opened}
          channel={channelModal.channel}
          countryId={selectedCountryId}
          onClose={() => setChannelModal({ opened: false, channel: null })}
        />
      )}
      <UserFormModal opened={userModal} onClose={() => setUserModal(false)} />
      <InviteUserModal opened={inviteModal} onClose={() => setInviteModal(false)} />
      <UserAccessModal
        opened={accessModal.opened}
        user={accessModal.user}
        onClose={() => setAccessModal({ opened: false, user: null })}
      />
    </Container>
  )
}
