"use client";

import { useEffect } from "react";
import { fetchAllStudents } from "@/lib/utils/fetchAllStudents";
import { cacheStudentProfile } from "@/lib/offline/studentsCache";
import { getOfflineDB } from "@/lib/offline/db";

/**
 * Background full-roster sync so ANY saved student — not just ones already
 * opened in this browser — can be searched and viewed with no internet.
 *
 * Runs once per mount (dashboard load) and again whenever the connection
 * comes back after being offline. Entirely best-effort and low priority:
 * it never blocks rendering, never surfaces errors to the user, and backs
 * off immediately if the connection drops mid-sync.
 */
export function useOfflineStudentSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    async function syncProfiles(studentIds: string[]) {
      const db = getOfflineDB();
      if (!db) return;

      for (const id of studentIds) {
        if (cancelled || !navigator.onLine) return;
        try {
          // Skip students already synced recently — keeps repeat syncs cheap.
          const existing = await db.studentProfiles.get(id);
          const isFresh = existing && Date.now() - existing.updatedAt < 1000 * 60 * 30;
          if (isFresh) continue;

          const res = await fetch(`/api/students/${id}/profile`, { cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            await cacheStudentProfile(id, json);
          }
        } catch {
          // Best-effort — move on to the next student.
        }
        // Small gap between requests so a large roster doesn't flood the API.
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    async function runSync() {
      if (!navigator.onLine) return;
      try {
        const students = await fetchAllStudents();
        if (cancelled) return;
        const ids = students
          .map((s) => (s as { id?: string }).id)
          .filter((id): id is string => typeof id === "string");
        await syncProfiles(ids);
      } catch {
        // Offline or request failed — fetchAllStudents already falls back
        // to the existing cache, nothing further to do here.
      }
    }

    runSync();
    const onOnline = () => runSync();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);
}
