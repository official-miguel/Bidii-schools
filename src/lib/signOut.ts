"use client";

import { clearOfflineDB } from "@/lib/offline/db";
import { CACHED_JSON_PREFIX } from "@/lib/offline/cachedJson";
import { WARM_KEY_PREFIX } from "@/lib/offline/useOfflineStudentSync";

/** Service worker caches holding the signed-in user's pages and images (see public/sw.js). */
const USER_CACHE_PREFIXES = ["bidii-pages-", "bidii-assets-"];

/**
 * Signs the current user out of this device.
 *
 * Beyond ending the session, an installed app on a shared phone must not keep
 * acting for the previous user, so this also:
 *   - unlinks the device's push subscription (server + browser), so their
 *     notifications stop arriving here;
 *   - drops cached pages and images and the offline IndexedDB copy of school
 *     records.
 *
 * Every cleanup step is best-effort: sign-out must still complete when
 * offline or when a browser lacks one of these APIs.
 */
export async function signOut(): Promise<void> {
  let pushEndpoint: string | undefined;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      pushEndpoint = subscription.endpoint;
      await subscription.unsubscribe();
    }
  } catch {
    // No service worker / push support — nothing to unlink.
  }

  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pushEndpoint }),
  }).catch(() => {});

  await Promise.allSettled([
    clearOfflineDB(),
    (async () => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHED_JSON_PREFIX) || k.startsWith(WARM_KEY_PREFIX));
      keys.forEach((k) => localStorage.removeItem(k));
    })(),
    (async () => {
      if (!("caches" in window)) return;
      const names = await caches.keys();
      const userCaches = names.filter((n) => USER_CACHE_PREFIXES.some((p) => n.startsWith(p)));
      await Promise.all(userCaches.map((n) => caches.delete(n)));
    })(),
  ]);
}
