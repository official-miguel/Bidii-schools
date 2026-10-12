"use client";

import { useEffect } from "react";
import { fetchAllStudents } from "@/lib/utils/fetchAllStudents";
import { cacheStudentProfile } from "@/lib/offline/studentsCache";
import { getOfflineDB } from "@/lib/offline/db";

export const WARM_KEY_PREFIX = "bidii_page_warmed_at:";
const WARM_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Ask the service worker to keep this portal's Students page for offline use,
 * so search works offline even if the page was never opened on this device.
 * (Student profiles need no warming: sw.js redirects any uncached one to the
 * /offline/student shell.) At most every six hours per page.
 */
async function warmStudentsPage(): Promise<void> {
  try {
    const portal = window.location.pathname.split("/")[1];
    if (portal !== "teacher" && portal !== "staff" && portal !== "principal") return;
    const url = `/${portal}/students`;
    const key = WARM_KEY_PREFIX + url;
    if (Date.now() - Number(localStorage.getItem(key)) < WARM_EVERY_MS) return;

    const registration = await navigator.serviceWorker?.ready;
    if (!registration?.active || !navigator.onLine) return;
    registration.active.postMessage({ type: "CACHE_PAGES", urls: [url] });
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Best-effort — offline search still works for pages already visited.
  }
}

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
    void warmStudentsPage();
    const onOnline = () => { runSync(); void warmStudentsPage(); };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);
}
