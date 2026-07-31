import { createFileRoute } from '@tanstack/react-router'
import { apiRoute, json } from '@/lib/http'

export const Route = createFileRoute('/api/me')({
  server: {
    handlers: apiRoute({
      GET: ({ access }) => json(access),
    }),
  },
})
