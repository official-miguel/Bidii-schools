"use client";

import { usePushNotifications } from "@/lib/push/usePushNotifications";
import NotificationPrompt from "@/components/NotificationPrompt";

/**
 * Mounted once per signed-in shell (DashboardShell, ParentPortalShell):
 * keeps the push subscription in sync and offers the "Turn on" card.
 */
export default function PushRegistrar() {
  usePushNotifications();
  return <NotificationPrompt />;
}
