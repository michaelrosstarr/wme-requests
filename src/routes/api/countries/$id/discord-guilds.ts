import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getDiscordGuilds } from '@/lib/discord-guilds'

export const Route = createFileRoute('/api/countries/$id/discord-guilds')({
  server: {
    handlers: apiRoute({
      GET: ({ params, access }) => getDiscordGuilds(access!, parseInt(params.id)),
    }),
  },
})
