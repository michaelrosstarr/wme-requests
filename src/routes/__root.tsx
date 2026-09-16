import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
// Side-effect type import: pulls in TanStack Start's ambient module augmentation that adds
// `server.handlers` to `createFileRoute` options, used by the API routes under routes/api/.
import type {} from '@tanstack/react-start'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider, mantineHtmlProps, ColorSchemeScript } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { PostHogProvider } from '@posthog/react'
import { useState } from 'react'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import appCss from '../styles.css?url'

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
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
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
            <MantineProvider defaultColorScheme="auto">
              <Notifications position="top-right" />
              <AppHeader />
              {children}
              <Footer />
              <CookieConsent />
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
