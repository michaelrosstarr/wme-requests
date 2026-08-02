import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { subscribe } from '@/lib/subscriptions'

export const Route = createFileRoute('/api/push/subscribe')({
  server: {
    handlers: apiRoute({
      POST: async ({ request, access }) =>
        subscribe(access!, (await request.json().catch(() => ({}))) as Parameters<typeof subscribe>[1]),
    }),
  },
})
