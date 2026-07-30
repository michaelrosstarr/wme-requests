import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getCountry, updateCountry, deleteCountry } from '@/lib/countries'

export const Route = createFileRoute('/api/countries/$id')({
  server: {
    handlers: apiRoute({
      GET: ({ params }) => getCountry(parseInt(params.id)),
      PUT: async ({ request, params }) =>
        updateCountry(
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof updateCountry>[1],
        ),
      DELETE: ({ params }) => deleteCountry(parseInt(params.id)),
    }),
  },
})
