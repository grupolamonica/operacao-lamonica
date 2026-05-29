// Service Worker for Torre de Controle — Web Push notifications
// Phase 6, plan 06-06 (D-12).
//
// Scope: '/' (root) — registered explicitly from frontend usePushSubscription
// with `navigator.serviceWorker.register('/sw.js', { scope: '/' })`.
// Root scope is REQUIRED so push events reach SW regardless of the SPA's
// internal route (RESEARCH Pitfall #2).
//
// Payload shape from backend (api/src/modules/push/push.dispatcher.ts):
//   { title: string, body: string, url: string }
//
// Notes:
//   - icon-192.png / icon-512.png in public/ are optional. SW degrades gracefully
//     without them (browser shows default app icon). README documents this as a
//     post-deploy operational item.
//   - requireInteraction: true so the notification stays visible until acted on
//     (operator may be away from the screen).
//   - tag uses the URL so duplicate notifications for the same alert replace
//     each other instead of stacking.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Torre de Controle', body: event.data.text(), url: '/' }
  }

  const title = payload.title || 'Torre de Controle'
  const body  = payload.body  || ''
  const url   = payload.url   || '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:               '/icon-192.png',
      badge:              '/icon-192.png',
      data:               { url },
      tag:                url || 'torre-default',
      requireInteraction: true,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if it matches the target URL.
        for (const client of clients) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open a new window. self.clients.openWindow requires user
        // gesture context (notificationclick provides it).
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
        return undefined
      }),
  )
})
