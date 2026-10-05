import { type QueryClient, useQuery } from '@tanstack/react-query'
import { useLoaderData } from '@tanstack/react-router'
import { getSessionFn } from './get-session-fn'

export const SESSION_KEY = ['session']
const SESSION_STALE_MS = 60_000

/**
 * The session for route guards. Answers from the cache when there is one (refreshing it in the
 * background once stale), so client-side navigation doesn't wait on a round trip to the account
 * service. That's only the UI's gate: every API call still checks the session on the server.
 * A cached "signed out" is always re-checked, since /login checks afresh and would bounce back.
 */
export async function getSession(queryClient: QueryClient) {
  const cached = queryClient.getQueryData<Awaited<ReturnType<typeof getSessionFn>>>(SESSION_KEY)
  if (cached && !cached.session) return queryClient.fetchQuery({ queryKey: SESSION_KEY, queryFn: () => getSessionFn() })
  return queryClient.ensureQueryData({
    queryKey: SESSION_KEY,
    queryFn: () => getSessionFn(),
    staleTime: SESSION_STALE_MS,
    revalidateIfStale: true,
  })
}

/**
 * The current session for client components (header, home page). Starts from what the root
 * loader fetched during server rendering, and re-checks whenever the tab regains focus, so
 * signing in or out on the account service (or another app) shows up as soon as you come back.
 */
export function useSession() {
  const initial = useLoaderData({ from: '__root__' })
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => getSessionFn(),
    initialData: initial ?? undefined,
    staleTime: SESSION_STALE_MS,
    refetchOnWindowFocus: 'always',
  })
}

/** Absolute URL on the account service, with `redirect` back to `returnTo` (default: this page). */
export function accountLink(authUrl: string, path: '/login' | '/logout' | '/account' | '/signup', returnTo?: string) {
  const url = new URL(path, authUrl)
  if (path !== '/account') {
    url.searchParams.set('redirect', returnTo ?? (typeof window === 'undefined' ? '' : window.location.href))
  }
  return url.href
}
