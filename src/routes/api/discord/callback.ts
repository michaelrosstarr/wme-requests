import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { handleInstallCallback } from '@/lib/discord-guilds'

export const Route = createFileRoute('/api/discord/callback')({
  server: {
    handlers: apiRoute({
      // Public so a signed-out or failed callback still gets a readable page instead of a JSON
      // 401 — handleInstallCallback checks the session and the OAuth state itself.
      GET: { public: true, handler: ({ request }) => handleInstallCallback(request) },
    }),
  },
})
