import { createFileRoute } from '@tanstack/react-router'
import { apiRoute } from '@/lib/http'
import { unlinkDiscordGuild } from '@/lib/discord-guilds'

export const Route = createFileRoute('/api/countries/$id/discord-guilds/$guildId')({
  server: {
    handlers: apiRoute({
      DELETE: ({ params, access }) => unlinkDiscordGuild(access!, parseInt(params.id), params.guildId),
    }),
  },
})
