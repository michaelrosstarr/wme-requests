import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { blockSubmitter, listBlockedSubmitters } from '@/lib/blocks'

export const Route = createFileRoute('/api/blocked-submitters')({
  server: {
    handlers: apiRoute({
      GET: ({ access }) => listBlockedSubmitters(access!),
      POST: async ({ request, access }) =>
        blockSubmitter(access!, (await request.json().catch(() => ({}))) as Parameters<typeof blockSubmitter>[1]),
    }),
  },
})
