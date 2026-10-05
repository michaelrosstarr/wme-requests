import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { startInstall } from '@/lib/discord-guilds'

export const Route = createFileRoute('/api/discord/install')({
  server: {
    handlers: apiRoute({
      // Opened in a new tab from the channel form; redirects to Discord's "Add to server" page.
      GET: ({ request, access }) =>
        startInstall(access!, parseInt(new URL(request.url).searchParams.get('country_id') ?? '')),
    }),
  },
})
