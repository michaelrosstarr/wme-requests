import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { apiRoute, json } from '@/lib/http'

export const Route = createFileRoute('/api/push/vapid-public-key')({
  server: {
    handlers: apiRoute({
      // Public: the VAPID public key is safe to expose — it's what the browser needs as
      // applicationServerKey when calling pushManager.subscribe().
      GET: { public: true, handler: () => json({ key: env.WEB_PUSH_VAPID_PUBLIC_KEY }) },
    }),
  },
})
