import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
// Side-effect type import: pulls in TanStack Start's ambient module augmentation that adds
// `server.handlers` to `createFileRoute` options, used by the API routes under routes/api/.
import type {} from '@tanstack/react-start'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider, mantineHtmlProps, ColorSchemeScript } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { useState } from 'react'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import appCss from '../styles.css?url'

import AppHeader from '../components/AppHeader'

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
        <QueryClientProvider client={queryClient}>
          <MantineProvider defaultColorScheme="auto">
            <Notifications position="top-right" />
            <AppHeader />
            {children}
          </MantineProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
