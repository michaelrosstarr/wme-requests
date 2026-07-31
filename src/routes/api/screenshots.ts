import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { uploadScreenshot } from '@/lib/screenshots'

export const Route = createFileRoute('/api/screenshots')({
  server: {
    handlers: apiRoute({
      // Public: called by the userscript before creating the request — see
      // src/lib/requests.ts's createRequest for why the key is attached at creation
      // time rather than via a follow-up authenticated call.
      POST: { public: true, handler: ({ request }) => uploadScreenshot(request) },
    }),
  },
})
