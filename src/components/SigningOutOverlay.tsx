import { useEffect, useState } from 'react'
import { Loader, Overlay, Paper, Stack, Text, Transition } from '@mantine/core'

/** Signing-out card: on its own (the /logout page) or inside the overlay below. */
export function SigningOutCard() {
  return (
    <Paper withBorder shadow="md" radius="md" px="xl" py="lg" w={180}>
      <Stack align="center" gap="sm">
        <Loader type="dots" />
        <Text size="sm" fw={500}>
          Signing out…
        </Text>
      </Stack>
    </Paper>
  )
}

/**
 * Full-screen overlay shown from the moment someone clicks "Sign out" until the page changes.
 * It fades in and out, and its card sits dead centre in the viewport, the same spot as on the
 * /logout page, so the hand-off between the two doesn't jump.
 */
export default function SigningOutOverlay({ visible }: { visible: boolean }) {
  return (
    <Transition mounted={visible} transition="fade" duration={200} exitDuration={200} timingFunction="ease">
      {(styles) => (
        <Overlay fixed center blur={3} backgroundOpacity={0.35} zIndex={1000} style={styles}>
          <PopIn />
        </Overlay>
      )}
    </Transition>
  )
}

/** The card scales in slightly after the backdrop starts fading, rather than appearing at once. */
function PopIn() {
  const [shown, setShown] = useState(false)
  useEffect(() => setShown(true), [])
  return (
    <Transition mounted={shown} transition="pop" duration={250} timingFunction="ease">
      {(styles) => (
        <div style={styles}>
          <SigningOutCard />
        </div>
      )}
    </Transition>
  )
}
