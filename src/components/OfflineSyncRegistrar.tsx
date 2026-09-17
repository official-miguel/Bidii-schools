"use client";

import { useOfflineStudentSync } from "@/lib/offline/useOfflineStudentSync";

/** Invisible — just mounts the background offline-roster-sync effect. */
export default function OfflineSyncRegistrar() {
  useOfflineStudentSync();
  return null;
}
