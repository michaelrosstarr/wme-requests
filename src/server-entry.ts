import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { dbRun } from '#/lib/db'

const fetch = createStartHandler(defaultStreamHandler)

export default {
  fetch,
  // Cloudflare Cron Trigger (see wrangler.jsonc `triggers.crons`) — purges requests older
  // than 24h so submitted request data (permalinks, notes, screenshots) isn't retained
  // indefinitely. See Terms of Service §4 for the retention policy this enforces.
  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    await dbRun(`DELETE FROM requests WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')`)
  },
}
