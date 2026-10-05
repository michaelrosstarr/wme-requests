import { env } from 'cloudflare:workers'
import { getCentralSession } from './central-auth'
import { getUserAccess, type UserAccess } from './access'
import { captureServerException } from './posthog-server'

export function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

export function err(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, status)
}

// ALLOWED_ORIGINS is a comma-separated allowlist (or "*" for any origin). Unlike a bare
// passthrough, this checks the request's actual Origin against that list and only ever
// echoes back a specific matching origin — an unlisted origin gets no Allow-Origin header
// at all, which the browser treats as a CORS failure.
function resolveAllowedOrigin(requestOrigin: string | null) {
  const configured = (env.ALLOWED_ORIGINS || '*').trim()
  if (configured === '*') return '*'
  const allowList = configured
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return requestOrigin && allowList.includes(requestOrigin) ? requestOrigin : null
}

function corsHeaders(requestOrigin: string | null) {
  const allowedOrigin = resolveAllowedOrigin(requestOrigin)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type,${PAGE_ORIGIN_HEADER}`,
    Vary: 'Origin',
  }
  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin
  return headers
}

// The Waze pages the userscript runs on, the only place requests may be submitted from.
const WAZE_ORIGINS = ['https://waze.com', 'https://www.waze.com', 'https://beta.waze.com']
// GM_xmlhttpRequest is sent by the userscript manager, so the browser gives it the extension's
// Origin (or none) rather than waze.com's. The userscript names the page it's running on here.
export const PAGE_ORIGIN_HEADER = 'X-WME-Requests-Origin'
const EXTENSION_ORIGIN = /^[a-z-]+-extension:\/\//

/**
 * A 403 unless the request comes from a Waze page. A browser-set Origin must be a Waze origin,
 * which stops other websites submitting through a visitor's browser. A request from a userscript
 * manager (extension Origin, or none) is let through, unless REQUIRE_PAGE_ORIGIN_HEADER is "true"
 * (wrangler.jsonc): then it must name a Waze origin in PAGE_ORIGIN_HEADER, which also stops casual
 * use of the API outside WME. A non-browser client can still send any headers it likes.
 */
export function requireWazeOrigin(request: Request) {
  const origin = request.headers.get('Origin')
  let pageOrigin: string | null
  if (origin && !EXTENSION_ORIGIN.test(origin)) pageOrigin = origin
  else if (String(env.REQUIRE_PAGE_ORIGIN_HEADER) === 'true') pageOrigin = request.headers.get(PAGE_ORIGIN_HEADER)
  else return null
  if (pageOrigin && WAZE_ORIGINS.includes(pageOrigin)) return null
  return err('Requests can only be submitted from the Waze Map Editor', 403, { code: 'wrong_origin' })
}

// `setCookies`: refreshed session cookies from the account service, passed on to the browser.
function withCors(response: Response, requestOrigin: string | null, setCookies: string[] = []) {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(corsHeaders(requestOrigin))) headers.set(k, v)
  for (const c of setCookies) headers.append('Set-Cookie', c)
  return new Response(response.body, { status: response.status, headers })
}

type ApiContext = {
  request: Request
  params: Record<string, string>
  // The calling user's country access. Always present for protected handlers; `null` for
  // `public: true` handlers, which run without a session check (see src/lib/access.ts).
  access: UserAccess | null
}

type ApiHandler = (ctx: ApiContext) => Promise<Response> | Response

/** A plain handler is protected (requires a session) by default; opt out with `{ public: true, handler }`. */
type RouteHandler = ApiHandler | { public: true; handler: ApiHandler }

/**
 * Wraps route method handlers with CORS headers, a preflight OPTIONS response, a 500 fallback,
 * and — unless marked `public: true` — a session check (the shared WMEKit account cookie,
 * checked with wmeAuth over the AUTH binding) that returns 401 when unauthenticated, 403
 * `no_access` for an account nobody has given access to this app, and otherwise resolves the
 * caller's country access onto `ctx.access`.
 */
export function apiRoute(handlers: Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE', RouteHandler>>) {
  const wrapped: Record<string, (ctx: Omit<ApiContext, 'access'>) => Promise<Response> | Response> = {
    OPTIONS: (ctx) => new Response(null, { status: 204, headers: corsHeaders(ctx.request.headers.get('Origin')) }),
  }
  for (const [method, entry] of Object.entries(handlers)) {
    if (!entry) continue
    const isPublic = typeof entry === 'object' && 'public' in entry
    const handler = typeof entry === 'function' ? entry : entry.handler
    wrapped[method] = async (ctx) => {
      const origin = ctx.request.headers.get('Origin')
      let access: UserAccess | null = null
      let refreshedCookies: string[] = []
      try {
        if (!isPublic) {
          const { user, setCookies } = await getCentralSession(ctx.request.headers)
          refreshedCookies = setCookies
          if (!user) return withCors(err('Unauthorized', 401), origin, refreshedCookies)
          access = await getUserAccess(user.id)
          if (!access) {
            return withCors(err('You have not been given access to WME Requests', 403, { code: 'no_access' }), origin, refreshedCookies)
          }
        }
        return withCors(await handler({ ...ctx, access }), origin, refreshedCookies)
      } catch (e) {
        await captureServerException(e, ctx.request, access?.userId)
        console.error(e)
        return withCors(err('Internal server error', 500), origin)
      }
    }
  }
  return wrapped
}
