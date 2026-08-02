import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { unsubscribe } from '@/lib/subscriptions'

export const Route = createFileRoute('/api/push/subscriptions/$id')({
  server: {
    handlers: apiRoute({
      DELETE: ({ params, access }) => unsubscribe(access!, parseInt(params.id)),
    }),
  },
})
