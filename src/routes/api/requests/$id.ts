import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getRequest, updateRequest, deleteRequest } from '@/lib/requests'
import { captureServerEvent } from '@/lib/posthog-server'

export const Route = createFileRoute('/api/requests/$id')({
  server: {
    handlers: apiRoute({
      GET: ({ params, access }) => getRequest(access!, parseInt(params.id)),
      PUT: async ({ request, params, access }) => {
        const requestId = parseInt(params.id)
        const body = (await request.json().catch(() => ({}))) as Parameters<typeof updateRequest>[2]
        const response = await updateRequest(access!, requestId, body)
        if (response.ok) {
          await captureServerEvent(
            request,
            'request_status_updated',
            { request_id: requestId, request_status: body.status },
            access!.userId,
          )
        }
        return response
      },
      DELETE: async ({ request, params, access }) => {
        const requestId = parseInt(params.id)
        const response = await deleteRequest(access!, requestId)
        if (response.ok) {
          await captureServerEvent(request, 'request_deleted', { request_id: requestId }, access!.userId)
        }
        return response
      },
    }),
  },
})
