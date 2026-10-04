import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
// Side-effect type import: pulls in TanStack Start's ambient module augmentation that adds
// `server.handlers` to `createFileRoute` options, used by the API routes under routes/api/.
import type {} from '@tanstack/react-start'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider, mantineHtmlProps, ColorSchemeScript } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { ModalsProvider } from '@mantine/modals'
import { PostHogProvider } from '@posthog/react'
import { useState } from 'react'

import '@fontsource-variable/rubik'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import appCss from '../styles.css?url'

import { getSessionFn } from '../lib/get-session-fn'
import { cssVariablesResolver, theme } from '../lib/theme'
import AppHeader from '../components/AppHeader'
import Footer from '../components/Footer'
import CookieConsent from '../components/CookieConsent'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'WME Requests' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  // The session, fetched once while the first page is server-rendered, so the header (see
  // useSession) is right on first paint instead of showing "Sign in" until the browser has asked.
  // Not re-run on client navigations: useSession's query keeps it fresh from there. A failure
  // here only means starting signed-out-looking, as before, not an error page.
  loader: () => getSessionFn().catch(() => null),
  shouldReload: false,
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        <HeadContent />
      </head>
      <body>
        <PostHogRoot>
          <QueryClientProvider client={queryClient}>
            <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
              <ModalsProvider>
                <Notifications position="top-right" />
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                  <AppHeader />
                  <main style={{ flex: 1 }}>{children}</main>
                  <Footer />
                </div>
                <CookieConsent />
              </ModalsProvider>
            </MantineProvider>
          </QueryClientProvider>
        </PostHogRoot>
        <Scripts />
      </body>
    </html>
  )
}

function PostHogRoot({ children }: Readonly<{ children: React.ReactNode }>) {
  const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
  const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

  if (!apiKey || !apiHost) {
    if (import.meta.env.DEV) {
      const missing = !apiKey ? 'VITE_PUBLIC_POSTHOG_PROJECT_TOKEN' : 'VITE_PUBLIC_POSTHOG_HOST'
      throw new Error(
        `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`,
      )
    }
    return children
  }

  return (
    <PostHogProvider
      apiKey={apiKey}
      options={{
        api_host: apiHost,
        defaults: '2026-05-30',
        capture_exceptions: true,
        debug: import.meta.env.DEV,
        tracing_headers: typeof window !== 'undefined' ? [window.location.hostname] : [],
        // No tracking until the cookie banner records a choice — see CookieConsent.tsx,
        // which calls opt_in_capturing() once the user accepts.
        opt_out_capturing_by_default: true,
      }}
    >
      {children}
    </PostHogProvider>
  )
}
