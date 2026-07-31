import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { updateCredential, deleteCredential } from '@/lib/credentials'

export const Route = createFileRoute('/api/credentials/$id')({
  server: {
    handlers: apiRoute({
      PUT: async ({ request, params, access }) =>
        updateCredential(
          access!,
          parseInt(params.id),
          (await request.json().catch(() => ({}))) as Parameters<typeof updateCredential>[2],
        ),
      DELETE: ({ params, access }) => deleteCredential(access!, parseInt(params.id)),
    }),
  },
})
