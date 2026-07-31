import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { listCredentials, createCredential } from '@/lib/credentials'
import type { CredentialType } from '@/lib/db'

export const Route = createFileRoute('/api/credentials')({
  server: {
    handlers: apiRoute({
      GET: ({ request, access }) => {
        const type = new URL(request.url).searchParams.get('type') as CredentialType | null
        return listCredentials(access!, type ?? undefined)
      },
      POST: async ({ request, access }) =>
        createCredential(access!, (await request.json().catch(() => ({}))) as Parameters<typeof createCredential>[1]),
    }),
  },
})
