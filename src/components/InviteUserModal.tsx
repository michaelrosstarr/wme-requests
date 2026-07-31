import { useEffect, useState } from 'react'
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useCountries, useInviteUser } from '@/lib/queries'
import CountryAccessFields from './CountryAccessFields'

interface Props {
  opened: boolean
  onClose: () => void
}

interface FormValues {
  name: string
  email: string
}

export default function InviteUserModal({ opened, onClose }: Readonly<Props>) {
  const invite = useInviteUser()
  const countries = useCountries().data ?? []
  const [isGlobal, setIsGlobal] = useState(false)
  const [countryIds, setCountryIds] = useState<string[]>([])
  const [accessError, setAccessError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    initialValues: { name: '', email: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'A valid email is required'),
    },
  })

  useEffect(() => {
    if (opened) {
      form.setValues({ name: '', email: '' })
      setIsGlobal(false)
      setCountryIds([])
      setAccessError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  async function handleSubmit(values: FormValues) {
    setAccessError(null)
    if (!isGlobal && !countryIds.length) {
      setAccessError('Select at least one country, or grant global access')
      return
    }
    try {
      await invite.mutateAsync({
        name: values.name.trim(),
        email: values.email.trim(),
        isGlobal,
        countryIds: countryIds.map(Number),
      })
      onClose()
    } catch (e) {
      form.setFieldError('email', (e as Error).message)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Invite User" closeOnClickOutside={!invite.isPending} closeOnEscape={!invite.isPending}>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <Text size="sm" c="dimmed">
            Sends an email with a link to set their own password.
          </Text>
          <TextInput label="Name" placeholder="e.g. Jane Doe" disabled={invite.isPending} {...form.getInputProps('name')} />
          <TextInput
            label="Email"
            type="email"
            placeholder="e.g. jane@example.com"
            disabled={invite.isPending}
            {...form.getInputProps('email')}
          />
          <CountryAccessFields
            countries={countries}
            isGlobal={isGlobal}
            onIsGlobalChange={setIsGlobal}
            countryIds={countryIds}
            onCountryIdsChange={setCountryIds}
            disabled={invite.isPending}
            error={accessError}
          />
          <Group justify="flex-end">
            <Button variant="default" type="button" onClick={onClose} disabled={invite.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={invite.isPending}>
              Send Invite
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
