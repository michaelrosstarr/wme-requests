import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getFeed } from '@/lib/feed'

export const Route = createFileRoute('/api/feed')({
  server: {
    handlers: apiRoute({
      // Public: the pull-based counterpart to the public dashboard — same unscoped read as
      // GET /api/requests when unauthenticated.
      GET: {
        public: true,
        handler: ({ request }) => {
          const url = new URL(request.url)
          return getFeed(url.searchParams, url.origin)
        },
      },
    }),
  },
})
