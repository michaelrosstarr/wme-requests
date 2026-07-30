import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getCountries, createCountry } from '@/lib/countries'

export const Route = createFileRoute('/api/countries')({
  server: {
    handlers: apiRoute({
      // Public: the Tampermonkey userscript reads this cross-origin from waze.com to
      // populate its country dropdown. It has no way to do an interactive login.
      GET: { public: true, handler: () => getCountries() },
      POST: async ({ request }) =>
        createCountry(await request.json().catch(() => ({})) as Parameters<typeof createCountry>[0]),
    }),
  },
})
