import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { clearExpiredScreenshotKeys } from '#/lib/screenshots'

const startFetch = createStartHandler(defaultStreamHandler)

export default {
  fetch(request: Request, env: Env) {
    // WME Requests moved from requests.wazetools.com (still attached) to APP_URL; send its pages
    // there. /api stays: copies of the userscript that haven't updated yet still call it.
    const url = new URL(request.url)
    if (url.hostname.endsWith('.wazetools.com') && !url.pathname.startsWith('/api/')) {
      url.hostname = new URL(env.APP_URL).hostname
      return Response.redirect(url.toString(), 301)
    }
    return startFetch(request)
  },
  // Cloudflare Cron Trigger (see wrangler.jsonc `triggers.crons`). Screenshots live for a week
  // (an R2 lifecycle rule deletes them, Terms of Service §4); this drops the requests' links to
  // them. Requests themselves are kept.
  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    await clearExpiredScreenshotKeys()
  },
}
