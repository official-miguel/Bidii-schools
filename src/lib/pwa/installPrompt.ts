"use client";

import { useEffect, useState } from "react";

/** Chromium's install event — not in lib.dom yet. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __bidiiInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export const INSTALLABLE_EVENT = "bidii:installable";
export const INSTALLED_EVENT = "bidii:installed";

/**
 * beforeinstallprompt can fire before React hydrates, so it is captured by
 * this inline script in the root layout and parked on window. Only /install
 * suppresses the browser's own install banner (it shows its own button);
 * everywhere else the browser keeps its default behaviour.
 */
export const INSTALL_PROMPT_CAPTURE_SCRIPT = `
(function () {
  window.addEventListener('beforeinstallprompt', function (e) {
    if (location.pathname === '/install') e.preventDefault();
    window.__bidiiInstallPrompt = e;
    window.dispatchEvent(new Event('${INSTALLABLE_EVENT}'));
  });
  window.addEventListener('appinstalled', function () {
    window.__bidiiInstallPrompt = null;
    window.dispatchEvent(new Event('${INSTALLED_EVENT}'));
  });
})();
`;

/**
 * The deferred install prompt, if the browser offered one (Chrome, Edge,
 * Samsung Internet, Opera on Android and desktop). Safari and Firefox never do.
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const sync = () => setPromptEvent(window.__bidiiInstallPrompt ?? null);
    const onInstalled = () => { setPromptEvent(null); setInstalled(true); };
    sync();
    window.addEventListener(INSTALLABLE_EVENT, sync);
    window.addEventListener(INSTALLED_EVENT, onInstalled);
    return () => {
      window.removeEventListener(INSTALLABLE_EVENT, sync);
      window.removeEventListener(INSTALLED_EVENT, onInstalled);
    };
  }, []);

  async function install(): Promise<boolean> {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // A prompt event can only be used once.
    window.__bidiiInstallPrompt = null;
    setPromptEvent(null);
    if (outcome === "accepted") setInstalled(true);
    return outcome === "accepted";
  }

  return { canPrompt: promptEvent !== null, installed, install };
}
