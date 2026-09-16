"use client";

import { usePushNotifications } from "@/lib/push/usePushNotifications";

/** Invisible — just mounts the push-subscription effect for this dashboard. */
export default function PushRegistrar() {
  usePushNotifications();
  return null;
}
