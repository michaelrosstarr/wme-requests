import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { updateRegion, deleteRegion } from '@/lib/regions'

export const Route = createFileRoute('/api/regions/$id')({
  server: {
    handlers: apiRoute({
      PUT: async ({ request, params, access }) =>
        updateRegion(
          access!,
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof updateRegion>[2],
        ),
      DELETE: ({ params, access }) => deleteRegion(access!, parseInt(params.id)),
    }),
  },
})
