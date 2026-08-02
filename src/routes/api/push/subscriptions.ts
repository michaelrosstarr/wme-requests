import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { listMySubscriptions } from '@/lib/subscriptions'

export const Route = createFileRoute('/api/push/subscriptions')({
  server: {
    handlers: apiRoute({
      GET: ({ access }) => listMySubscriptions(access!),
    }),
  },
})
