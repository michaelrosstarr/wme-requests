import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionFn } from '@/lib/get-session-fn'

// Sign-in happens on the WMEKit account service; this route only builds the hand-off URL
// (with an absolute ?redirect= back to this app, which the service checks against its
// allowlist) so existing links to /login keep working.
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' && search.redirect.startsWith('/') ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { session, authUrl, appUrl } = await getSessionFn()
    if (session) throw redirect({ href: search.redirect ?? '/requests' })
    const back = new URL(search.redirect ?? '/requests', appUrl)
    const login = new URL('/login', authUrl)
    login.searchParams.set('redirect', back.href)
    throw redirect({ href: login.href })
  },
})
