import { useQuery } from '@tanstack/react-query'
import { getSessionFn } from './get-session-fn'

export const SESSION_KEY = ['session']

/** The current session for client components (header, home page). */
export function useSession() {
  return useQuery({ queryKey: SESSION_KEY, queryFn: () => getSessionFn(), staleTime: 60_000 })
}

/** Absolute URL on the account service, with `redirect` back to `returnTo` (default: this page). */
export function accountLink(authUrl: string, path: '/login' | '/logout' | '/account' | '/signup', returnTo?: string) {
  const url = new URL(path, authUrl)
  if (path !== '/account') {
    url.searchParams.set('redirect', returnTo ?? (typeof window === 'undefined' ? '' : window.location.href))
  }
  return url.href
}
