"use client";

import { useEffect } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Registers the Web Push service worker and subscribes this browser to
 * push, once per session per browser. Mounted from DashboardShell so every
 * signed-in dashboard (teacher, staff, principal, parent) gets it — that's
 * the one thing that has to be app-wide rather than per-portal.
 *
 * Silently no-ops when push isn't supported (no Notification API, no VAPID
 * key configured, or the user hasn't granted permission) — this is additive,
 * never something that should block a page from working.
 */
export function usePushNotifications() {
  useEffect(() => {
    const publicKey: string | undefined = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return;
    const vapidKey: string = publicKey;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

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
