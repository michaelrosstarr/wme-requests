import { useState } from 'react'
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { Plus, Trash2 } from 'lucide-react'
import { notifications } from '@mantine/notifications'
import { useCreateRegion, useDeleteRegion, useRegions } from '@/lib/queries'
import type { Country } from '@/lib/types'

interface Props {
  opened: boolean
  onClose: () => void
  country: Country | null
}

export default function RegionsModal({ opened, onClose, country }: Readonly<Props>) {
  const countryId = country ? String(country.id) : null
  const regionsQuery = useRegions(countryId)
  const regions = regionsQuery.data ?? []
  const createRegion = useCreateRegion()
  const deleteRegion = useDeleteRegion()

  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  function handleAdd() {
    if (!countryId || !name.trim() || !code.trim()) return
    createRegion.mutate(
      { countryId, name: name.trim(), code: code.trim() },
      {
        onSuccess: () => {
          setName('')
          setCode('')
        },
        onError: (e) => notifications.show({ color: 'red', title: 'Add failed', message: (e as Error).message }),
      },
    )
  }

  function handleDelete(id: number) {
    if (!countryId) return
    if (!confirm('Delete this region? Channels scoped to it will be removed; requests will fall back to the country level.')) return
    deleteRegion.mutate(
      { id, countryId },
      { onError: (e) => notifications.show({ color: 'red', title: 'Delete failed', message: (e as Error).message }) },
    )
  }

  return (
    <Modal opened={opened} onClose={onClose} title={country ? `Regions — ${country.name}` : 'Regions'}>
      <Stack>
        <Text size="xs" c="dimmed">
          Optional states/provinces within {country?.name ?? 'this country'}. Requests and channels can be scoped to
          one of these; without a match, notifications fall back to the country's own channels.
        </Text>
        <Stack gap="xs">
          {regionsQuery.isLoading && <Text c="dimmed">Loading…</Text>}
          {!regionsQuery.isLoading && !regions.length && <Text c="dimmed">No regions yet.</Text>}
          {regions.map((r) => (
            <Group key={r.id} justify="space-between" wrap="nowrap">
              <Text size="sm">
                {r.name} <Text span c="dimmed" size="xs">({r.code})</Text>
              </Text>
              <Button
                size="xs"
                color="red"
                variant="light"
                leftSection={<Trash2 size={14} />}
                loading={deleteRegion.isPending && deleteRegion.variables?.id === r.id}
                onClick={() => handleDelete(r.id)}
              >
                Delete
              </Button>
            </Group>
          ))}
        </Stack>
        <Group align="flex-end" gap="xs">
          <TextInput
            label="Name"
            placeholder="e.g. California"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <TextInput
            label="Code"
            placeholder="e.g. CA"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            style={{ width: 100 }}
          />
          <Button leftSection={<Plus size={14} />} loading={createRegion.isPending} onClick={handleAdd}>
            Add
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
