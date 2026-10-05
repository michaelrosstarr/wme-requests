import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { getDiscordGuildChannels } from '@/lib/discord-guilds'

export const Route = createFileRoute('/api/countries/$id/discord-guilds/$guildId/channels')({
  server: {
    handlers: apiRoute({
      GET: ({ params, access }) => getDiscordGuildChannels(access!, parseInt(params.id), params.guildId),
    }),
  },
})
