import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getChannels, createChannel } from '@/lib/channels'
import { captureServerEvent } from '@/lib/posthog-server'

export const Route = createFileRoute('/api/countries/$id/channels')({
  server: {
    handlers: apiRoute({
      GET: ({ params, access }) => getChannels(access!, parseInt(params.id)),
      POST: async ({ request, params, access }) => {
        const countryId = parseInt(params.id)
        const body = (await request.json().catch(() => ({}))) as Parameters<typeof createChannel>[2]
        const response = await createChannel(access!, countryId, body)
        if (response.ok) {
          await captureServerEvent(
            request,
            'notification_channel_created',
            {
              country_id: countryId,
              region_scoped: body.region_id != null,
              platform: body.platform,
              event_type: body.event_type,
            },
            access!.userId,
          )
        }
        return response
      },
    }),
  },
})
