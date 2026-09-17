import { useRef } from 'react'
import { ActionIcon, Menu, Text, Textarea, type TextareaProps } from '@mantine/core'
import { Braces } from 'lucide-react'
import type { TemplateVariable } from '@/lib/templateVariables'

interface Props extends TextareaProps {
  variables: readonly TemplateVariable[]
}

// A Textarea with a button that inserts `{variable}` tokens at the cursor
// position, for fields whose value is a template string (e.g. custom_prefix).
export default function VariableTextInput({ variables, value, onChange, disabled, ...rest }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function insertVariable(key: string) {
    const input = inputRef.current
    const token = `{${key}}`
    const current = String(value ?? '')
    const start = input?.selectionStart ?? current.length
    const end = input?.selectionEnd ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    // Mantine's form onChange unwraps real events (via `nativeEvent`), but also
    // accepts a plain value directly — pass the string itself rather than a
    // fake event object, which would get stored as-is (`[object Object]`).
    ;(onChange as unknown as ((v: string) => void) | undefined)?.(next)
    const caret = start + token.length
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(caret, caret)
    })
  }

  return (
    <Textarea
      ref={inputRef}
      value={value}
      onChange={onChange}
      disabled={disabled}
      rightSection={
        <Menu withinPortal position="bottom-end" shadow="md" disabled={disabled}>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm" title="Insert variable" tabIndex={-1} disabled={disabled}>
              <Braces size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Insert variable</Menu.Label>
            {variables.map((v) => (
              <Menu.Item key={v.key} onClick={() => insertVariable(v.key)}>
                <Text size="sm" ff="monospace">{`{${v.key}}`}</Text>
                <Text size="xs" c="dimmed">
                  {v.description}
                </Text>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      }
      rightSectionPointerEvents="all"
      rightSectionProps={{ style: { alignItems: 'flex-start', paddingTop: 6 } }}
      {...rest}
    />
  )
}
