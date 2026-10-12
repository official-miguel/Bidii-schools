"use client";

/**
 * Browser-side Web Push helpers.
 *
 * Permission is only ever requested from a user gesture (enablePush, called
 * from a button). iOS rejects a prompt without one, and Chrome/Firefox
 * quietly auto-block sites that prompt on page load — so a prompt fired from
 * an effect leaves most devices permanently unsubscribed.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushState =
  /** Notifications are on for this device. */
  | "granted"
  /** Not asked yet — the "Turn on" button can prompt. */
  | "default"
  /** The user blocked notifications; only browser settings can undo that. */
  | "denied"
  /** iOS/iPadOS in a browser tab: push only works once added to the home screen. */
  | "ios-needs-install"
  /** Browser has no Web Push, or the server has no VAPID key configured. */
  | "unsupported";

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ reports itself as Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** True when running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function getPushState(): PushState {
  if (typeof window === "undefined") return "unsupported";
  if (isIOS() && !isStandalone()) return "ios-needs-install";
  if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) ||
      !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const view = new Uint8Array(a);
  return view.length === b.length && view.every((byte, i) => byte === b[i]);
}

/**
 * Makes sure this device holds a live subscription and that the server has
 * it on record for the signed-in user. Safe to call on every app launch:
 * it never prompts, and it repairs the three ways push silently breaks —
 * an expired/rotated subscription, a VAPID key change, and a shared device
 * whose subscription still points at the previous user.
 */
export async function syncPushSubscription(): Promise<boolean> {
  if (getPushState() !== "granted" || !VAPID_PUBLIC_KEY) return false;

  const registration = await navigator.serviceWorker.ready;
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key as BufferSource,
    });
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return res.ok;
}

/** Asks for permission and subscribes. Must be called from a click/tap handler. */
export async function enablePush(): Promise<PushState> {
  const state = getPushState();
  if (state !== "default" && state !== "granted") return state;

  if (state === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return result;
  }
  await syncPushSubscription();
  return "granted";
}
