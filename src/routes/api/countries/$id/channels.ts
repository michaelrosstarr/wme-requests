import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getChannels, createChannel } from '@/lib/channels'

export const Route = createFileRoute('/api/countries/$id/channels')({
  server: {
    handlers: apiRoute({
      GET: ({ params }) => getChannels(parseInt(params.id)),
      POST: async ({ request, params }) =>
        createChannel(
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof createChannel>[1],
        ),
    }),
  },
})
