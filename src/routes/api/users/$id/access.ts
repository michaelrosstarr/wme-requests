import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { updateUserAccess } from '@/lib/users'

export const Route = createFileRoute('/api/users/$id/access')({
  server: {
    handlers: apiRoute({
      PUT: async ({ request, params, access }) =>
        updateUserAccess(
          access!,
          params.id,
          (await request.json().catch(() => ({}))) as Parameters<typeof updateUserAccess>[2],
        ),
    }),
  },
})
