import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getRequests, createRequest } from '@/lib/requests'

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
        handler: async ({ request }) =>
          createRequest((await request.json().catch(() => ({}))) as Parameters<typeof createRequest>[0]),
      },
    }),
  },
})
