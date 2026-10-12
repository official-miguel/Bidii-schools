"use client";

import { useEffect } from "react";
import { INSTALL_PROMPT_CAPTURE_SCRIPT } from "@/lib/pwa/installPrompt";

/**
 * Registers the service worker (offline cache + Web Push) on every page —
 * including /login and /install, which an installed app opens before anyone
 * signs in. Mounted once, from the root layout.
 *
 * Skipped under `next dev`: dev chunk URLs are not content-hashed, so the
 * worker's cache-first static cache would serve stale code. Set
 * NEXT_PUBLIC_ENABLE_SW_IN_DEV=1 to test the worker locally.
 */
export default function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV !== "1") {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    let registration: ServiceWorkerRegistration | undefined;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => { registration = reg; })
        .catch((err) => console.error("[pwa] service worker registration failed", err));
    };

    // An installed app can stay open for days; pick up new deploys and clear
    // the unread dot on the app icon whenever it comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      registration?.update().catch(() => {});
      navigator.clearAppBadge?.().catch(() => {});
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    navigator.clearAppBadge?.().catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("error", onChunkError, true);
    window.addEventListener("unhandledrejection", onChunkError);

    return () => {
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("error", onChunkError, true);
      window.removeEventListener("unhandledrejection", onChunkError);
    };
  }, []);

  return null;
}

const CHUNK_RELOAD_KEY = "bidii_chunk_reload_at";

/**
 * A deploy while the app is open: Next reloads into the new build on the next
 * navigation, but a lazily loaded chunk requested before that still points at
 * the old build, which Vercel no longer serves. Reload once into the new
 * version instead of leaving the action broken. Skipped offline (the failure
 * is the network, not the build) and at most once a minute, so it can't loop.
 */
function onChunkError(event: ErrorEvent | PromiseRejectionEvent | Event) {
  const reason = "reason" in event ? event.reason : "error" in event ? event.error : null;
  const target = event.target as HTMLScriptElement | null;
  const isChunkFailure =
    (reason && (reason.name === "ChunkLoadError" || /Loading (CSS )?chunk|dynamically imported module/i.test(String(reason.message)))) ||
    (target?.tagName === "SCRIPT" && target.src.includes("/_next/static/"));
  if (!isChunkFailure || !navigator.onLine) return;

  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY));
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return; // Without a loop guard, don't risk reload loops.
  }
  window.location.reload();
}

/** Inline <head> script — see INSTALL_PROMPT_CAPTURE_SCRIPT. */
export function InstallPromptScript() {
  return <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_CAPTURE_SCRIPT }} />;
}
