// Minimal service worker for Web Push — see src/lib/push-client.ts (subscribe flow) and
// src/lib/push.ts (server-side send). Registered at the root scope ('/') so it can control
// notifications for the whole app.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'WME Requests'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body,
      icon: '/favicon.ico',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    }),
  )
})
