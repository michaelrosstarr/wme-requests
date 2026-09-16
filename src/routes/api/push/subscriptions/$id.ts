import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { unsubscribe } from '@/lib/subscriptions'
import { captureServerEvent } from '@/lib/posthog-server'

export const Route = createFileRoute('/api/push/subscriptions/$id')({
  server: {
    handlers: apiRoute({
      DELETE: async ({ request, params, access }) => {
        const subscriptionId = parseInt(params.id)
        const response = await unsubscribe(access!, subscriptionId)
        if (response.ok) {
          await captureServerEvent(
            request,
            'push_subscription_deleted',
            { subscription_id: subscriptionId },
            access!.userId,
          )
        }
        return response
      },
    }),
  },
})
