import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { testChannel } from '@/lib/channels'
import { captureServerEvent } from '@/lib/posthog-server'

export const Route = createFileRoute('/api/channels/$id/test')({
  server: {
    handlers: apiRoute({
      POST: async ({ request, params, access }) => {
        const channelId = parseInt(params.id)
        const response = await testChannel(access!, channelId)
        if (response.ok) {
          await captureServerEvent(
            request,
            'notification_channel_tested',
            { channel_id: channelId },
            access!.userId,
          )
        }
        return response
      },
    }),
  },
})
