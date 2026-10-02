import { Loader, Overlay, Paper, Stack, Text } from '@mantine/core'

/** Signing-out card: on its own (the /logout page) or, with `overlay`, covering the whole page. */
export function SigningOutCard() {
  return (
    <Paper withBorder shadow="md" radius="md" px="xl" py="lg">
      <Stack align="center" gap="sm">
        <Loader type="dots" />
        <Text size="sm" fw={500}>
          Signing out…
        </Text>
      </Stack>
    </Paper>
  )
}

/** Full-screen overlay shown from the moment someone clicks "Sign out" until the page changes. */
export default function SigningOutOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <Overlay fixed center blur={3} backgroundOpacity={0.35} zIndex={1000}>
      <SigningOutCard />
    </Overlay>
  )
}
