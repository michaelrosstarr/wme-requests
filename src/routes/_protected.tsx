import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionFn } from '@/lib/get-session-fn'

export const Route = createFileRoute('/_protected')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session) {
      throw redirect({ to: '/login' })
    }
    return { session }
  },
  component: () => <Outlet />,
})
