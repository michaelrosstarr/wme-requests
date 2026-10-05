import { useEffect } from 'react'
import { Button, Group, Modal, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useBlockSubmitter } from '@/lib/queries'

interface Props {
  opened: boolean
  // Prefilled (and fixed) when blocking from a list of submitters; empty to type one in.
  username: string | null
  onClose: () => void
}

interface FormValues {
  username: string
  reason: string
}

export default function BlockSubmitterModal({ opened, username, onClose }: Readonly<Props>) {
  const block = useBlockSubmitter()

  const form = useForm<FormValues>({
    initialValues: { username: '', reason: '' },
    validate: {
      username: (v) => (v.trim() ? null : 'A Waze username is required'),
    },
  })

  useEffect(() => {
    if (opened) form.setValues({ username: username ?? '', reason: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  async function handleSubmit(values: FormValues) {
    try {
      const blocked = await block.mutateAsync({
        username: values.username.trim(),
        reason: values.reason.trim() || null,
      })
      notifications.show({
        color: 'green',
        message: `Blocked ${blocked.username}.`,
      })
      onClose()
    } catch (e) {
      form.setFieldError('username', (e as Error).message)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Block Submitter"
      closeOnClickOutside={!block.isPending}
      closeOnEscape={!block.isPending}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <Text size="sm" c="dimmed">
            Requests from this Waze username will be refused in every country. Requests they've already made stay as
            they are.
          </Text>
          <TextInput
            label="Waze username"
            placeholder="e.g. some_editor"
            disabled={block.isPending || !!username}
            {...form.getInputProps('username')}
          />
          <Textarea
            label="Reason"
            description="Only shown to admins."
            placeholder="Optional"
            autosize
            minRows={2}
            disabled={block.isPending}
            {...form.getInputProps('reason')}
          />
          <Group justify="flex-end">
            <Button variant="default" type="button" onClick={onClose} disabled={block.isPending}>
              Cancel
            </Button>
            <Button type="submit" color="red" loading={block.isPending}>
              Block
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
