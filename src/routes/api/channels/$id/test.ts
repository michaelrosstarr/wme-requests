import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { testChannel } from '@/lib/channels'

export const Route = createFileRoute('/api/channels/$id/test')({
  server: {
    handlers: apiRoute({
      POST: ({ params }) => testChannel(parseInt(params.id)),
    }),
  },
})
