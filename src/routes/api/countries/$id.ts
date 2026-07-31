import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getCountry, updateCountry, deleteCountry } from '@/lib/countries'

export const Route = createFileRoute('/api/countries/$id')({
  server: {
    handlers: apiRoute({
      GET: ({ params }) => getCountry(parseInt(params.id)),
      PUT: async ({ request, params, access }) =>
        updateCountry(
          access!,
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof updateCountry>[2],
        ),
      DELETE: ({ params, access }) => deleteCountry(access!, parseInt(params.id)),
    }),
  },
})
