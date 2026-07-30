import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '@/lib/auth'

// Better Auth's own handler — not wrapped in src/lib/http.ts's apiRoute(), since this is only
// ever called same-origin from the dashboard itself (no public CORS headers needed or wanted).
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => getAuth().handler(request),
      POST: ({ request }) => getAuth().handler(request),
    },
  },
})
