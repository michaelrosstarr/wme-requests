import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionFn } from '@/lib/get-session-fn'

// Account settings (password, passkeys, 2FA, Discord, security log) live on the WazeTools
// account service now; this keeps old /account links working.
export const Route = createFileRoute('/account')({
  beforeLoad: async () => {
    const { authUrl } = await getSessionFn()
    throw redirect({ href: new URL('/account', authUrl).href })
  },
})
