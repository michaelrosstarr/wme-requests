import { useEffect } from 'react'
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useCreateCountry, useUpdateCountry } from '@/lib/queries'
import type { Country } from '@/lib/types'

interface Props {
  opened: boolean
  onClose: () => void
  country?: Country | null
}

interface FormValues {
  name: string
  code: string
}

export default function CountryFormModal({ opened, onClose, country }: Readonly<Props>) {
  const isEdit = !!country
  const create = useCreateCountry()
  const update = useUpdateCountry()

  const form = useForm<FormValues>({
    initialValues: { name: '', code: '' },
    validate: {
      name: (v) => (v.trim() ? null : 'Name is required'),
      code: (v) => (v.trim().length >= 2 && v.trim().length <= 10 ? null : 'Code must be 2–10 characters'),
    },
  })

  useEffect(() => {
    if (opened) form.setValues({ name: country?.name ?? '', code: country?.code ?? '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, country])

  async function handleSubmit(values: FormValues) {
    try {
      if (isEdit && country) {
        await update.mutateAsync({ id: country.id, name: values.name.trim(), code: values.code.trim() })
      } else {
        await create.mutateAsync({ name: values.name.trim(), code: values.code.trim() })
      }
      onClose()
    } catch (e) {
      form.setFieldError('code', (e as Error).message)
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? 'Edit Country' : 'Add Country'} closeOnClickOutside={!saving} closeOnEscape={!saving}>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            label="Country Name"
            placeholder="e.g. Australia"
            disabled={saving}
            {...form.getInputProps('name')}
          />
          <TextInput
            label="Country Code"
            placeholder="e.g. AU"
            maxLength={10}
            disabled={saving}
            {...form.getInputProps('code')}
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
