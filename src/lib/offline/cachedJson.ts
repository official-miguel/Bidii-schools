/**
 * src/lib/offline/cachedJson.ts
 *
 * GET a small JSON resource (class list, subject list, "me") and remember the
 * last good response, so screens that need it alongside the offline student
 * roster keep working without internet. Never throws: when the network fails
 * and nothing was cached, the caller's fallback is returned.
 *
 * Stored in localStorage — these payloads are small. signOut() removes every
 * key with CACHED_JSON_PREFIX so nothing carries over to the next user.
 */
"use client";

export const CACHED_JSON_PREFIX = "bidii_cached_json:";

export async function fetchJsonCached<T>(url: string, fallback: T): Promise<T> {
  const key = CACHED_JSON_PREFIX + url;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as T;
      try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* storage full/blocked */ }
      return data;
    }
    // A real server answer (e.g. 403) — don't mask it with stale data.
    return fallback;
  } catch {
    try {
      const cached = localStorage.getItem(key);
      return cached ? (JSON.parse(cached) as T) : fallback;
    } catch {
      return fallback;
    }
  }
}
