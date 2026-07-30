import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { updateChannel, deleteChannel } from '@/lib/channels'

export const Route = createFileRoute('/api/channels/$id')({
  server: {
    handlers: apiRoute({
      PUT: async ({ request, params }) =>
        updateChannel(
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof updateChannel>[1],
        ),
      DELETE: ({ params }) => deleteChannel(parseInt(params.id)),
    }),
  },
})
