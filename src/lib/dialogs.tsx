import { useState } from 'react'
import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { modals } from '@mantine/modals'

// Promise-based replacements for window.confirm()/prompt(), rendered as Mantine modals
// (needs the <ModalsProvider> in src/routes/__root.tsx).

export function confirmDialog(opts: {
  title: string
  message: React.ReactNode
  confirmLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: opts.title,
      centered: true,
      children: <Text size="sm">{opts.message}</Text>,
      labels: { confirm: opts.confirmLabel ?? 'Confirm', cancel: 'Cancel' },
      confirmProps: opts.danger ? { color: 'red' } : undefined,
      onConfirm: () => resolve(true),
      // Fires for Cancel, Escape, the close button and clicking outside alike.
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    })
  })
}

/** Resolves to the entered text (possibly empty), or null if the dialog was dismissed. */
export function promptDialog(opts: {
  title: string
  label: string
  description?: string
  placeholder?: string
  confirmLabel?: string
}): Promise<string | null> {
  return new Promise((resolve) => {
    const id = modals.open({
      title: opts.title,
      centered: true,
      onClose: () => resolve(null),
      children: (
        <PromptBody
          {...opts}
          onSubmit={(value) => {
            resolve(value)
            modals.close(id)
          }}
          onCancel={() => modals.close(id)}
        />
      ),
    })
  })
}

function PromptBody({
  label,
  description,
  placeholder,
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  label: string
  description?: string
  placeholder?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(value.trim())
      }}
    >
      <Stack>
        <TextInput
          data-autofocus
          label={label}
          description={description}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{confirmLabel ?? 'OK'}</Button>
        </Group>
      </Stack>
    </form>
  )
}
