import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { inviteUser } from '@/lib/users'
import { captureServerEvent } from '@/lib/posthog-server'

export const Route = createFileRoute('/api/users/invite')({
  server: {
    handlers: apiRoute({
      POST: async ({ request, access }) => {
        const body = (await request.json().catch(() => ({}))) as Parameters<typeof inviteUser>[1]
        const response = await inviteUser(access!, body)
        if (response.ok) {
          await captureServerEvent(
            request,
            'user_invited',
            {
              global_access: body.isGlobal !== false,
              country_scope_count: body.countryIds?.length ?? 0,
            },
            access!.userId,
          )
        }
        return response
      },
    }),
  },
})
