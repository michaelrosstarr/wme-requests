import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders, getResponseHeaders } from '@tanstack/react-start/server'
import { authUrl, getCentralSession } from './central-auth'
import { getUserAccess, type UserAccess } from './access'

export interface AppSession {
  user: { id: string; name: string; email: string }
  /** Null for a WMEKit account nobody has given access to this app yet. */
  access: UserAccess | null
}

/**
 * The signed-in user (from the WMEKit account service) plus their access to this app, and the
 * account service's URL so pages can link to sign-in / account / sign-out there, and this app's
 * own origin for building absolute ?redirect= URLs back.
 */
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ session: AppSession | null; authUrl: string; appUrl: string }> => {
    const { user, setCookies } = await getCentralSession(new Headers(getRequestHeaders()))
    const responseHeaders = getResponseHeaders()
    for (const c of setCookies) responseHeaders.append('set-cookie', c)
    const base = { authUrl: authUrl(), appUrl: env.APP_URL }
    if (!user) return { session: null, ...base }
    return {
      session: { user: { id: user.id, name: user.name, email: user.email }, access: await getUserAccess(user.id) },
      ...base,
    }
  },
)
