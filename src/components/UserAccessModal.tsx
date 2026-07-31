import { useEffect, useState } from 'react'
import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useCountries, useUpdateUserAccess } from '@/lib/queries'
import type { AdminUser } from '@/lib/types'
import CountryAccessFields from './CountryAccessFields'

interface Props {
  opened: boolean
  onClose: () => void
  user: AdminUser | null
}

export default function UserAccessModal({ opened, onClose, user }: Readonly<Props>) {
  const countries = useCountries().data ?? []
  const update = useUpdateUserAccess()
  const [isGlobal, setIsGlobal] = useState(false)
  const [countryIds, setCountryIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (opened && user) {
      setIsGlobal(!!user.isGlobal)
      setCountryIds(user.countryIds.map(String))
      setError(null)
    }
  }, [opened, user])

  async function handleSubmit() {
    if (!user) return
    setError(null)
    if (!isGlobal && !countryIds.length) {
      setError('Select at least one country, or grant global access')
      return
    }
    try {
      await update.mutateAsync({ id: user.id, isGlobal, countryIds: countryIds.map(Number) })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Edit Access" closeOnClickOutside={!update.isPending} closeOnEscape={!update.isPending}>
      <Stack>
        <Text size="sm" c="dimmed">
          {user?.email}
        </Text>
        <CountryAccessFields
          countries={countries}
          isGlobal={isGlobal}
          onIsGlobalChange={setIsGlobal}
          countryIds={countryIds}
          onCountryIdsChange={setCountryIds}
          disabled={update.isPending}
          error={error}
        />
        <Group justify="flex-end">
          <Button variant="default" type="button" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={update.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
