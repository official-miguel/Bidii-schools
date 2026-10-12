"use client";

import { useEffect } from "react";
import { syncPushSubscription } from "@/lib/push/client";

/**
 * Keeps this device's push subscription alive for the signed-in user.
 *
 * Runs on every dashboard mount but never prompts — when permission was
 * already granted it re-checks the subscription and re-registers it with the
 * server (see syncPushSubscription for what that repairs). Asking for
 * permission is NotificationPrompt's job, from a button tap.
 *
 * Service worker registration lives in PwaRegistrar (root layout), so the
 * offline cache and install support work on every page, signed in or not.
 */
export function usePushNotifications() {
  useEffect(() => {
    syncPushSubscription().catch((err) => {
      console.error("[push] subscription sync failed", err);
    });
  }, []);
}
