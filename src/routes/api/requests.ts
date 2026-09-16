import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getRequests, createRequest } from '@/lib/requests'
import { captureServerEvent } from '@/lib/posthog-server'

export const Route = createFileRoute('/api/requests')({
  server: {
    handlers: apiRoute({
      // Public: backs the view-only dashboard at "/" (see src/routes/index.tsx), which is
      // readable without logging in. getRequests treats a null access as unrestricted.
      GET: {
        public: true,
        handler: ({ request, access }) => getRequests(access, new URL(request.url).searchParams),
      },
      // Public: this is the endpoint the Tampermonkey userscript calls cross-origin from
      // waze.com to submit new requests. It has no way to do an interactive login.
      POST: {
        public: true,
        handler: async ({ request }) => {
          const body = (await request.json().catch(() => ({}))) as Parameters<typeof createRequest>[0]
          const response = await createRequest(body)
          if (response.ok) {
            const created = (await response.clone().json()) as { id: number }
            await captureServerEvent(
              request,
              'request_created',
              {
                request_id: created.id,
                request_type: body.type,
                country_id: Number(body.country_id),
                region_scoped: body.region_id != null,
                has_screenshot: Boolean(body.screenshot_key),
              },
              `request:${created.id}`,
            )
          }
          return response
        },
      },
    }),
  },
})
