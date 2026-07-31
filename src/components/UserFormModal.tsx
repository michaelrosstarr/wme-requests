import { useEffect, useState } from 'react'
import { Button, Group, Modal, PasswordInput, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useCountries, useCreateUser } from '@/lib/queries'
import CountryAccessFields from './CountryAccessFields'

interface Props {
  opened: boolean
  onClose: () => void
}

interface FormValues {
  name: string
  email: string
  password: string
}

export default function UserFormModal({ opened, onClose }: Readonly<Props>) {
  const create = useCreateUser()
  const countries = useCountries().data ?? []
  const [isGlobal, setIsGlobal] = useState(false)
  const [countryIds, setCountryIds] = useState<string[]>([])
  const [accessError, setAccessError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    initialValues: { name: '', email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'A valid email is required'),
      password: (v) => (v.length >= 8 ? null : 'Password must be at least 8 characters'),
    },
  })

  useEffect(() => {
    if (opened) {
      form.setValues({ name: '', email: '', password: '' })
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
      await create.mutateAsync({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        isGlobal,
        countryIds: countryIds.map(Number),
      })
      onClose()
    } catch (e) {
      form.setFieldError('email', (e as Error).message)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Create User" closeOnClickOutside={!create.isPending} closeOnEscape={!create.isPending}>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput label="Name" placeholder="e.g. Jane Doe" disabled={create.isPending} {...form.getInputProps('name')} />
          <TextInput
            label="Email"
            type="email"
            placeholder="e.g. jane@example.com"
            disabled={create.isPending}
            {...form.getInputProps('email')}
          />
          <PasswordInput label="Password" disabled={create.isPending} {...form.getInputProps('password')} />
          <CountryAccessFields
            countries={countries}
            isGlobal={isGlobal}
            onIsGlobalChange={setIsGlobal}
            countryIds={countryIds}
            onCountryIdsChange={setCountryIds}
            disabled={create.isPending}
            error={accessError}
          />
          <Group justify="flex-end">
            <Button variant="default" type="button" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
