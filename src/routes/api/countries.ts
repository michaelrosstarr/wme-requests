import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getCountries, createCountry } from '@/lib/countries'

export const Route = createFileRoute('/api/countries')({
  server: {
    handlers: apiRoute({
      // Public: the Tampermonkey userscript reads this cross-origin from waze.com to
      // populate its country dropdown. It has no way to do an interactive login. Scoped
      // down to the caller's assigned countries when a dashboard session is present.
      GET: { public: true, handler: ({ request }) => getCountries(request) },
      POST: async ({ request, access }) =>
        createCountry(access!, await request.json().catch(() => ({})) as Parameters<typeof createCountry>[1]),
    }),
  },
})
