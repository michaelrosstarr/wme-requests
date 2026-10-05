import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { unblockSubmitter } from '@/lib/blocks'

export const Route = createFileRoute('/api/blocked-submitters/$id')({
  server: {
    handlers: apiRoute({
      DELETE: ({ params, access }) => unblockSubmitter(access!, parseInt(params.id)),
    }),
  },
})
