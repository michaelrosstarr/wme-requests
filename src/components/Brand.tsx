import { ActionIcon, Group, Title, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { Moon, Sun, Wrench } from 'lucide-react'

// Header pieces shared with the wmekit.com site (../wazetools/src/Site.tsx).

/** Yellow wrench badge + wordmark. The caller wraps it in a link. */
export function Wordmark({ label }: { label: string }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <span className="kit-badge" style={{ background: 'var(--kit-yellow)' }}>
        <Wrench size={20} />
      </span>
      <Title order={3} className="kit-wordmark">
        {label}
      </Title>
    </Group>
  )
}

export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const dark = useComputedColorScheme('light') === 'dark'
  return (
    <ActionIcon
      className="kit-chunky"
      size={40}
      radius="xl"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setColorScheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </ActionIcon>
  )
}
