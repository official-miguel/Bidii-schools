"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { enablePush, getPushState, type PushState } from "@/lib/push/client";

const DISMISS_KEY = "bidii_push_prompt_dismissed_at";
/** After "Not now", ask again a week later rather than never. */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Card asking the user to turn on notifications. Browsers only allow the
 * permission prompt from a tap, so this is the one place it is triggered.
 *
 * On iPhone/iPad in a browser tab, push is impossible until Bidii is added to
 * the home screen, so the card points to /install instead.
 */
export default function NotificationPrompt() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!snoozed()) setState(getPushState());
  }, []);

  if (state !== "default" && state !== "ios-needs-install") return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage blocked */ }
    setState(null);
  }

  async function turnOn() {
    setBusy(true);
    try {
      setState(await enablePush());
    } catch (err) {
      console.error("[push] enable failed", err);
      setState(getPushState());
    } finally {
      setBusy(false);
    }
  }

  const ios = state === "ios-needs-install";

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed z-30 left-3 right-3 bottom-[calc(72px+env(safe-area-inset-bottom,0px))]
                 md:left-auto md:right-6 md:bottom-6 md:w-[360px]
                 bg-card border border-border rounded-xl shadow-lg p-4 animate-fade-in"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal dark:bg-teal/15">
          <Bell className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {ios ? "Get notifications on your iPhone" : "Turn on notifications"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate">
            {ios
              ? "Add Bidii to your Home Screen to receive lesson reminders, results and school alerts."
              : "Get lesson reminders, results, fee updates and school alerts on this device, even when Bidii is closed."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {ios ? (
              <Link
                href="/install"
                className="inline-flex min-h-[36px] items-center rounded-lg bg-teal px-3 text-xs font-semibold text-white hover:bg-teal/90"
              >
                Show me how
              </Link>
            ) : (
              <button
                type="button"
                onClick={turnOn}
                disabled={busy}
                className="inline-flex min-h-[36px] items-center rounded-lg bg-teal px-3 text-xs font-semibold text-white hover:bg-teal/90 disabled:opacity-60"
              >
                {busy ? "Turning on…" : "Turn on"}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex min-h-[36px] items-center rounded-lg px-3 text-xs font-medium text-slate hover:bg-teal-50 hover:text-foreground"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate hover:bg-teal-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
