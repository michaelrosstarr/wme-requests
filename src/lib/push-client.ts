import apiFetch from './api-client'

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush(params: { countryId: string; regionId: string | null; eventType: string }) {
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted')

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const { key } = await apiFetch<{ key: string }>('/push/vapid-public-key')

  let subscription = await registration.pushManager.getSubscription()

  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  });

  await apiFetch('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      country_id: params.countryId,
      region_id: params.regionId,
      event_type: params.eventType,
      subscription: subscription.toJSON(),
    }),
  })
}
