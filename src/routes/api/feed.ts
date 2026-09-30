import { createFileRoute } from '@tanstack/react-router'
import { apiRoute, err } from '@/lib/http'
import { getFeed } from '@/lib/feed'
import { getAccessForFeedToken } from '@/lib/feed-tokens'

export const Route = createFileRoute('/api/feed')({
  server: {
    handlers: apiRoute({
      // Public at the session layer because feed readers can't send a cookie — instead the
      // per-user `token` query param identifies the caller and scopes the feed to their countries.
      GET: {
        public: true,
        handler: async ({ request }) => {
          const url = new URL(request.url)
          const token = url.searchParams.get('token')
          const access = token ? await getAccessForFeedToken(token) : null
          if (!access) return err('Unauthorized', 401)
          return getFeed(access, url.searchParams, url.origin)
        },
      },
    }),
  },
})
