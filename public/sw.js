/**
 * public/sw.js — Bidii service worker.
 *
 * Registered on every page by src/components/PwaRegistrar.tsx. Three jobs:
 *
 *   1. Installability + offline shell — precaches the offline page and icons.
 *   2. Offline page cache — network-first for documents, so any page the user
 *      opened while online re-opens with no connection. Writes (non-GET) and
 *      /api/* are never touched: they still need a live round trip, and the
 *      app's own IndexedDB layer handles offline data.
 *   3. Web Push — shows notifications, routes taps into the app, and renews
 *      the subscription when the browser rotates it.
 *
 * Bump CORE_VERSION when any CORE_ASSETS file (e.g. offline.html) changes —
 * installed apps only re-download them when this file's bytes change. Bump
 * DATA_VERSION only when cached pages/assets must be thrown away; that costs
 * users their offline page copies. activate() drops caches of older versions.
 */
/* eslint-disable no-undef */
"use strict";

const CORE_VERSION = "v3";
const DATA_VERSION = "v2";
const CORE_CACHE = `bidii-core-${CORE_VERSION}`;     // offline pages, manifest, icons
const STATIC_CACHE = `bidii-static-${DATA_VERSION}`; // /_next/static — content-hashed, immutable
// User-specific — signOut() (src/lib/signOut.ts) deletes every "bidii-pages-*"
// and "bidii-assets-*" cache, since images include uploads such as photos.
const ASSET_CACHE = `bidii-assets-${DATA_VERSION}`;  // images, fonts and uploads
const PAGE_CACHE = `bidii-pages-${DATA_VERSION}`;    // HTML documents

const OFFLINE_URL = "/offline.html";
/** Remembers the last signed-in page, so an offline launch from the home screen lands somewhere useful. */
const LAST_PAGE_KEY = "/__bidii/last-page";
const PUBLIC_PAGE = /^\/(login|staff-login|signup|forgot-password|install)?(\/|$)/;
const MAX_PAGES = 80;
const MAX_ASSETS = 150;

/**
 * Offline student profiles. Any synced student must open offline, not only
 * ones whose page was visited, so an uncached /<portal>/students/<id> is
 * redirected to this static shell, which renders the on-device copy.
 */
const OFFLINE_STUDENT_URL = "/offline/student";
const STUDENT_PAGE = /^\/(teacher|staff|principal)\/students\/([^/]+)\/?$/;
const SHELL_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SHELL_TIME_HEADER = "x-bidii-cached-at";

const CORE_ASSETS = [
  OFFLINE_URL,
  "/manifest.json",
  "/logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/badge-96.png",
];

// ── Lifecycle ──────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      // Best-effort: a failure here must not block the worker from installing.
      .then(() => cacheOfflineStudentShell().catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const current = new Set([CORE_CACHE, STATIC_CACHE, ASSET_CACHE, PAGE_CACHE]);
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("bidii-") && !current.has(n)).map((n) => caches.delete(n))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })()
  );
});

/** Pages a signed-in dashboard may ask to keep for offline use (see OfflineSyncRegistrar). */
const WARMABLE_PAGE = /^\/(teacher|staff|principal)\/students\/?$/;

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "CACHE_PAGES" || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => typeof u === "string" && WARMABLE_PAGE.test(u));
  event.waitUntil(
    Promise.all(urls.map((u) => cachePageWithAssets(u, PAGE_CACHE).catch(() => {})))
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  // App Router RSC payloads vary per router state; caching them only bloats
  // storage. When one fails offline, Next falls back to a full navigation,
  // which handleNavigation serves from the page cache.
  if (request.headers.has("RSC") || url.searchParams.has("_rsc")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.destination === "image" || request.destination === "font" ||
      request.destination === "style" || url.pathname.startsWith("/_next/image") ||
      url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE, event));
  }
});

async function handleNavigation(event) {
  const { request } = event;
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(request));
    // Only cache real pages. Redirects (e.g. to /login when the session has
    // expired) and errors must never replace a good copy.
    if (response.ok && response.type === "basic" && !response.redirected) {
      const copy = response.clone();
      event.waitUntil(
        (async () => {
          const cache = await caches.open(PAGE_CACHE);
          await cache.put(request, copy);
          if (!PUBLIC_PAGE.test(new URL(request.url).pathname)) {
            await cache.put(LAST_PAGE_KEY, new Response(request.url));
          }
          await trimCache(PAGE_CACHE, MAX_PAGES);
        })().catch(() => {})
      );
      // Keep the offline student shell in step with new deploys.
      event.waitUntil(refreshOfflineStudentShellIfStale().catch(() => {}));
    }
    return response;
  } catch {
    const cache = await caches.open(PAGE_CACHE);
    const cached = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (cached) return cached;

    const url = new URL(request.url);
    const core = await caches.open(CORE_CACHE);

    // A student profile that was never opened here: show the on-device copy.
    const student = url.pathname.match(STUDENT_PAGE);
    if (student && (await core.match(OFFLINE_STUDENT_URL))) {
      const [, portal, id] = student;
      return Response.redirect(`${OFFLINE_STUDENT_URL}?id=${id}&portal=${portal}`, 302);
    }
    if (url.pathname === OFFLINE_STUDENT_URL) {
      const shell = await core.match(OFFLINE_STUDENT_URL);
      if (shell) return shell;
    }

    // Home-screen launch while offline: "/" is only a redirect on the server,
    // so send the user to the last page they had open instead.
    if (new URL(request.url).pathname === "/") {
      const last = await cache.match(LAST_PAGE_KEY);
      if (last) {
        const target = await last.text();
        if (await cache.match(target)) return Response.redirect(target, 302);
      }
    }
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
        await trimCache(cacheName, MAX_ASSETS);
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

/**
 * Fetches a page and caches it together with every /_next/static file its HTML
 * references, so it renders and hydrates with no network. Old chunk files stay
 * in STATIC_CACHE, so pages cached before a deploy keep working too.
 * Skips redirects (e.g. to /login) so they never replace a real page.
 */
async function cachePageWithAssets(url, cacheName) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok || response.redirected || response.type !== "basic") return;
  const html = await response.text();

  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  const staticCache = await caches.open(STATIC_CACHE);
  await Promise.all(
    assets.map(async (path) => {
      if (await staticCache.match(path)) return;
      const res = await fetch(path);
      if (res.ok) await staticCache.put(path, res);
    })
  );

  const headers = new Headers(response.headers);
  headers.set(SHELL_TIME_HEADER, String(Date.now()));
  const cache = await caches.open(cacheName);
  await cache.put(url, new Response(html, { status: 200, headers }));
}

function cacheOfflineStudentShell() {
  return cachePageWithAssets(OFFLINE_STUDENT_URL, CORE_CACHE);
}

async function refreshOfflineStudentShellIfStale() {
  const cached = await (await caches.open(CORE_CACHE)).match(OFFLINE_STUDENT_URL);
  const cachedAt = Number(cached && cached.headers.get(SHELL_TIME_HEADER));
  if (cachedAt && Date.now() - cachedAt < SHELL_MAX_AGE_MS) return;
  await cacheOfflineStudentShell();
}

/** Drops the oldest entries (Cache API keeps insertion order) beyond `max`. */
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.filter((k) => !k.url.endsWith(LAST_PAGE_KEY)).length - max;
  for (let i = 0, removed = 0; removed < excess && i < keys.length; i++) {
    if (keys[i].url.endsWith(LAST_PAGE_KEY)) continue;
    await cache.delete(keys[i]);
    removed++;
  }
}

// ── Push ───────────────────────────────────────────────────────────────────

/** Notification links must stay inside the app — never open another origin. */
function safeHref(href) {
  try {
    const url = new URL(href || "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  let data = { title: "Bidii Schools", body: "You have a new notification." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text() || data.body;
  }

  const options = {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { href: safeHref(data.href) },
    timestamp: Date.now(),
  };
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      // Unread dot on the installed app's icon; cleared when the app is opened.
      self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null,
      // Open windows refresh their bell immediately instead of on the next poll.
      self.clients.matchAll({ type: "window" }).then((list) =>
        list.forEach((client) => client.postMessage({ type: "PUSH_RECEIVED" }))
      ),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeHref(event.notification.data && event.notification.data.href);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const exact = windows.find((c) => c.url === target);
      if (exact) return exact.focus();

      const appWindow = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (appWindow) {
        await appWindow.focus();
        try {
          return await appWindow.navigate(target);
        } catch {
          // Window isn't controlled by this worker yet — open a fresh one below.
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});

// The push service rotated or expired our subscription. Re-subscribe and tell
// the server, otherwise this device would silently stop getting notifications.
// (The app also re-checks on every launch, for browsers that never fire this.)
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      let subscription = event.newSubscription;
      if (!subscription) {
        let key = old && old.options && old.options.applicationServerKey;
        if (!key) {
          const res = await fetch("/api/push/vapid-public-key");
          if (!res.ok) return;
          key = (await res.json()).publicKey;
        }
        if (!key) return;
        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }
      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...subscription.toJSON(), oldEndpoint: old ? old.endpoint : undefined }),
      });
    })().catch(() => {})
  );
});
