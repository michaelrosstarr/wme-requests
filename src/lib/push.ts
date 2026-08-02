import { env } from 'cloudflare:workers'
import { buildPushHTTPRequest } from '@pushforge/builder'

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

// Web Push services return 404/410 for a subscription that's expired or been unregistered
// by the browser — the caller should delete that row rather than retry it.
export async function sendPush(sub: PushSubscriptionKeys, payload: PushPayload): Promise<'ok' | 'gone' | 'error'> {
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: JSON.parse(env.WEB_PUSH_VAPID_PRIVATE_JWK),
    subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    message: {
      // buildPushHTTPRequest's payload type (Jsonifiable) isn't exported by the package, and
      // PushPayload's optional fields don't structurally match it — round-tripping through
      // JSON both satisfies the type and guarantees the payload really is JSON-serializable.
      payload: JSON.parse(JSON.stringify(payload)),
      adminContact: env.WEB_PUSH_CONTACT,
    },
  })
  const res = await fetch(endpoint, { method: 'POST', headers, body })
  if (res.status === 201 || res.status === 200) return 'ok'
  if (res.status === 404 || res.status === 410) return 'gone'
  return 'error'
}
