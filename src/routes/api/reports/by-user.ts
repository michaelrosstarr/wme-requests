import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getUserReport } from '@/lib/reports'

export const Route = createFileRoute('/api/reports/by-user')({
  server: {
    handlers: apiRoute({
      // Public: backs the view-only /reports page (see src/routes/reports.tsx).
      GET: { public: true, handler: ({ access }) => getUserReport(access) },
    }),
  },
})
