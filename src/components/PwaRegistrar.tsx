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

    return () => {
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

/** Inline <head> script — see INSTALL_PROMPT_CAPTURE_SCRIPT. */
export function InstallPromptScript() {
  return <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_CAPTURE_SCRIPT }} />;
}
