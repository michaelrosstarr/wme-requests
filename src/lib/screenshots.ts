import { env } from 'cloudflare:workers'
import { getDb } from './db'
import { json, err } from './http'

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
// Screenshots are deleted a week after upload by the bucket's R2 lifecycle rule
// (expire-screenshots-7d, see DEPLOYMENT.md).
const SCREENSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Absolute URL (on APP_URL, this app's own origin) so external services
// (Slack/Discord/email/Sheets) can fetch the image.
export function screenshotUrl(key: string | null): string | null {
  return key ? new URL(`/api/screenshots/${key}`, env.APP_URL).href : null
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
      'Cache-Control': `public, max-age=${SCREENSHOT_TTL_MS / 1000}, immutable`,
    },
  })
}

// R2 expires the images itself; this clears screenshot_key on requests whose image is gone (or
// about to be), so the dashboard doesn't link to a 404.
export async function clearExpiredScreenshotKeys() {
  const cutoff = new Date(Date.now() - SCREENSHOT_TTL_MS).toISOString()
  await getDb()
    .prepare(`UPDATE requests SET screenshot_key = NULL WHERE screenshot_key IS NOT NULL AND created_at < ?`)
    .bind(cutoff)
    .run()
}
