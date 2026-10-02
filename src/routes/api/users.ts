import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { listUsers } from '@/lib/users'

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: apiRoute({
      GET: ({ access }) => listUsers(access!),
    }),
  },
})
