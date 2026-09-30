import { createFileRoute } from '@tanstack/react-router'
import { apiRoute, json } from '@/lib/http'
import { getOrCreateFeedToken, rotateFeedToken } from '@/lib/feed-tokens'

export const Route = createFileRoute('/api/feed-token')({
  server: {
    handlers: apiRoute({
      GET: async ({ access }) => json({ token: await getOrCreateFeedToken(access!.userId) }),
      // Issues a new token, invalidating every feed URL built from the old one.
      POST: async ({ access }) => json({ token: await rotateFeedToken(access!.userId) }),
    }),
  },
})
