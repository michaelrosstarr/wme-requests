import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { resetUserPassword } from '@/lib/users'

export const Route = createFileRoute('/api/users/$id/reset-password')({
  server: {
    handlers: apiRoute({
      POST: ({ params, access }) => resetUserPassword(access!, params.id),
    }),
  },
})
