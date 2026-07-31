import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { inviteUser } from '@/lib/users'

export const Route = createFileRoute('/api/users/invite')({
  server: {
    handlers: apiRoute({
      POST: async ({ request, access }) =>
        inviteUser(access!, await request.json().catch(() => ({})) as Parameters<typeof inviteUser>[1]),
    }),
  },
})
