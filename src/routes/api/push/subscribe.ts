import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { subscribe } from '@/lib/subscriptions'
import { captureServerEvent } from '@/lib/posthog-server'

export const Route = createFileRoute('/api/push/subscribe')({
  server: {
    handlers: apiRoute({
      POST: async ({ request, access }) => {
        const body = (await request.json().catch(() => ({}))) as Parameters<typeof subscribe>[1]
        const response = await subscribe(access!, body)
        if (response.ok) {
          await captureServerEvent(
            request,
            'push_subscription_created',
            {
              country_id: Number(body.country_id),
              region_scoped: body.region_id != null,
              event_type: body.event_type || 'global',
            },
            access!.userId,
          )
        }
        return response
      },
    }),
  },
})
