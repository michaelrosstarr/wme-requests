import { env } from 'cloudflare:workers'
import { getAuth } from './auth'
import { getUserAccess, type UserAccess } from './access'

export function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

export function err(message: string, status = 400) {
  return json({ error: message }, status)
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
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin
  return headers
}

function withCors(response: Response, requestOrigin: string | null) {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(corsHeaders(requestOrigin))) headers.set(k, v)
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
 * and — unless marked `public: true` — a session check that returns 401 when unauthenticated
 * and resolves the caller's country access onto `ctx.access`.
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
      try {
        let access: UserAccess | null = null
        if (!isPublic) {
          const session = await getAuth().api.getSession({ headers: ctx.request.headers })
          if (!session) return withCors(err('Unauthorized', 401), origin)
          access = await getUserAccess(session.user.id)
        }
        return withCors(await handler({ ...ctx, access }), origin)
      } catch (e) {
        console.error(e)
        return withCors(err('Internal server error', 500), origin)
      }
    }
  }
  return wrapped
}
