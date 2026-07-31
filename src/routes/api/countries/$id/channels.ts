import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getChannels, createChannel } from '@/lib/channels'

export const Route = createFileRoute('/api/countries/$id/channels')({
  server: {
    handlers: apiRoute({
      GET: ({ params, access }) => getChannels(access!, parseInt(params.id)),
      POST: async ({ request, params, access }) =>
        createChannel(
          access!,
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof createChannel>[2],
        ),
    }),
  },
})
