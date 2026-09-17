"use client";

import { useEffect } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Registers the service worker (used for both Web Push and the offline
 * page cache) and, when configured, subscribes this browser to push.
 * Mounted from DashboardShell so every signed-in dashboard (teacher, staff,
 * principal, parent) gets it — that's the one thing that has to be app-wide
 * rather than per-portal.
 *
 * The service worker itself is registered unconditionally (offline support
 * shouldn't depend on push being configured); only the push subscription
 * step is skipped when there's no VAPID key or the user hasn't granted
 * permission. Silently no-ops when service workers aren't supported at all —
 * this is additive, never something that should block a page from working.
 */
export function usePushNotifications() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        const publicKey: string | undefined = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey || !("PushManager" in window)) return;
        const vapidKey: string = publicKey;

        if (Notification.permission === "default") {
          const result = await Notification.requestPermission();
          if (result !== "granted") return;
        }
        if (Notification.permission !== "granted") return;
        if (cancelled) return;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
          });
        }

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch (err) {
        console.error("[push] registration failed", err);
      }
    }

    register();
    return () => { cancelled = true; };
  }, []);
}
