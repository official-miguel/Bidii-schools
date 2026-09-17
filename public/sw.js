/**
 * public/sw.js — Web Push service worker.
 *
 * Registered by src/lib/push/usePushNotifications.ts on every dashboard
 * layout. Handles two events:
 *   - push            → show an OS notification from the server's payload
 *   - notificationclick → focus/open the app at the notification's href
 */
/* eslint-disable no-undef */
"use strict";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Bidii Schools", body: "You have a new notification." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the default text above.
  }

  const href = data.href || "/";

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      data: { href },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(href) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(href);
    })
  );
});

// ---------------------------------------------------------------------------
// Offline-first page cache.
//
// Network-first, cache-fallback for GET page/document requests only. This
// lets a page the user has already opened while online (e.g. a student
// profile) re-open with no connection. It never touches non-GET requests,
// so every write (saving marks, attendance, etc.) still requires a live
// network round trip exactly as before — nothing about mutations changes.
// ---------------------------------------------------------------------------
const PAGE_CACHE = "bidii-pages-v1";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Leave API/data calls to the app's own fetch + IndexedDB fallback layer.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
