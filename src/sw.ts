/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly, NetworkFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any }

// Precache static assets (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST)

// JS and HTML always go to network — no stale caching
registerRoute(({ request }) => request.destination === 'script', new NetworkOnly())
registerRoute(({ request }) => request.destination === 'document', new NetworkOnly())

// API routes: network-first
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'api-cache' })
)

// Force activate immediately when waiting
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ── Push notification handler ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'minutely'
  const options: NotificationOptions = {
    body: data.body ?? "time to plan your day ✦",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'daily-summary',
    data: { url: data.url ?? '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification click — open or focus the app ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data?.url as string) ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) { client.focus(); return }
      }
      return self.clients.openWindow(target)
    })
  )
})
