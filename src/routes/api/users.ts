import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { listUsers, createUser } from '@/lib/users'

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: apiRoute({
      GET: ({ access }) => listUsers(access!),
      POST: async ({ request, access }) =>
        createUser(access!, await request.json().catch(() => ({})) as Parameters<typeof createUser>[1]),
    }),
  },
})
