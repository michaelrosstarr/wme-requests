import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { serveScreenshot } from '@/lib/screenshots'

export const Route = createFileRoute('/api/screenshots/$key')({
  server: {
    handlers: apiRoute({
      // Public: embedded as an <img>/image_url in Slack, Discord, and email notifications,
      // fetched unauthenticated by those services.
      GET: { public: true, handler: ({ params }) => serveScreenshot(params.key) },
    }),
  },
})
