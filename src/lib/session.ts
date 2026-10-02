import { useQuery } from '@tanstack/react-query'
import { useLoaderData } from '@tanstack/react-router'
import { getSessionFn } from './get-session-fn'

export const SESSION_KEY = ['session']

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
    staleTime: 60_000,
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
