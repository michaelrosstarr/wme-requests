import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getRequest, updateRequest, deleteRequest } from '@/lib/requests'

export const Route = createFileRoute('/api/requests/$id')({
  server: {
    handlers: apiRoute({
      GET: ({ params }) => getRequest(parseInt(params.id)),
      PUT: async ({ request, params }) =>
        updateRequest(
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof updateRequest>[1],
        ),
      DELETE: ({ params }) => deleteRequest(parseInt(params.id)),
    }),
  },
})
