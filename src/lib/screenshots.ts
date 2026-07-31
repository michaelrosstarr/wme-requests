import { env } from 'cloudflare:workers'
import { json, err } from './http'

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024

// Absolute URL so external services (Slack/Discord/email/Sheets) can fetch the image —
// same reasoning as BETTER_AUTH_URL in src/lib/auth.ts.
export function screenshotUrl(key: string | null): string | null {
  return key ? `${env.BETTER_AUTH_URL}/api/screenshots/${key}` : null
}

// Public: the userscript uploads the captured viewport image before creating the
// request (so the key can be attached at creation time — see createRequest), the same
// way POST /api/requests itself is public and unauthenticated.
export async function uploadScreenshot(request: Request) {
  const contentType = request.headers.get('Content-Type')
  if (!contentType?.startsWith('image/')) return err('Content-Type must be an image/* type')
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > MAX_SCREENSHOT_BYTES) return err('Screenshot must be under 5MB')

  const key = `${crypto.randomUUID()}.png`
  await env.SCREENSHOTS.put(key, bytes, { httpMetadata: { contentType } })
  return json({ key, url: screenshotUrl(key) }, 201)
}

// Public: notification services (Slack/Discord unfurling, email image loading, etc.)
// fetch these unauthenticated, same as the images already embedded in those messages.
export async function serveScreenshot(key: string) {
  const object = await env.SCREENSHOTS.get(key)
  if (!object) return err('Screenshot not found', 404)
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
