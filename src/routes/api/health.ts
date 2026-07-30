import { createFileRoute } from '@tanstack/react-router'
import { apiRoute, json } from '@/lib/http'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: apiRoute({
      GET: () => json({ status: 'ok', ts: new Date().toISOString() }),
    }),
  },
})
