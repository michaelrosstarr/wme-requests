import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { getDb } from '#/lib/db'

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
  // Cloudflare Cron Trigger (see wrangler.jsonc `triggers.crons`) — purges requests older
  // than 24h so submitted request content (permalinks, notes, screenshots) isn't retained
  // indefinitely. See Terms of Service §4 for the retention policy this enforces. Per-user
  // counts are rolled up into request_stats first so Reports (src/lib/reports.ts) stay
  // accurate without keeping the underlying content.
  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    const db = getDb()
    const cutoff = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')`
    await db.batch([
      db.prepare(
        `INSERT INTO request_stats (submitted_by, country_id, type, count)
         SELECT submitted_by, country_id, type, COUNT(*)
         FROM requests
         WHERE created_at < ${cutoff} AND submitted_by IS NOT NULL AND submitted_by != ''
         GROUP BY submitted_by, country_id, type
         ON CONFLICT (submitted_by, country_id, type) DO UPDATE SET count = count + excluded.count`,
      ),
      db.prepare(`DELETE FROM requests WHERE created_at < ${cutoff}`),
    ])
  },
}
