import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getRequest, updateRequest, deleteRequest } from '@/lib/requests'

export const Route = createFileRoute('/api/requests/$id')({
  server: {
    handlers: apiRoute({
      GET: ({ params, access }) => getRequest(access!, parseInt(params.id)),
      PUT: async ({ request, params, access }) =>
        updateRequest(
          access!,
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof updateRequest>[2],
        ),
      DELETE: ({ params, access }) => deleteRequest(access!, parseInt(params.id)),
    }),
  },
})
