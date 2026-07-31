import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getUserReport } from '@/lib/reports'

export const Route = createFileRoute('/api/reports/by-user')({
  server: {
    handlers: apiRoute({
      GET: ({ access }) => getUserReport(access!),
    }),
  },
})
