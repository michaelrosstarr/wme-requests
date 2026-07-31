import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getRegions, createRegion } from '@/lib/regions'

export const Route = createFileRoute('/api/countries/$id/regions')({
  server: {
    handlers: apiRoute({
      // Public: the Tampermonkey userscript reads this cross-origin from waze.com to
      // populate its region dropdown and auto-detect the current one, same as /countries.
      GET: { public: true, handler: ({ params }) => getRegions(parseInt(params.id)) },
      POST: async ({ request, params, access }) =>
        createRegion(
          access!,
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof createRegion>[2],
        ),
    }),
  },
})
