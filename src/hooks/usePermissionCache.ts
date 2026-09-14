"use client";

/**
 * src/hooks/usePermissionCache.ts
 *
 * Client-side permission cache with:
 *   - 10-minute TTL keyed by `permissions_${schoolId}_${staffId}`
 *   - Automatic invalidation on: tab focus, Next.js navigation, explicit call
 *   - localStorage-based cross-tab broadcast so one tab's revocation notifies others
 *   - Graceful stale-cache fallback: up to 5 extra minutes on fetch failure
 *   - 403 response from any API auto-triggers a refresh
 *
 * Usage:
 *   const { permissions, loading, refresh } = usePermissionCache(schoolId, userId);
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { usePathname } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CachedPermissions {
  schoolId:         string;
  userId:           string;
  role:             string;
  assignedRoles:    string[];
  derivedKinds:     string[];
  modules:          Record<string, {
    canView:      boolean;
    canCreate:    boolean;
    canEdit:      boolean;
    canDelete:    boolean;
    canApprove:   boolean;
    canExport:    boolean;
    canPrint:     boolean;
    canManage:    boolean;
    canConfigure: boolean;
    canAIAccess:  boolean;
  }>;
  fetchedAt:  number; // unix ms
  expiresAt:  number; // unix ms
  staleUntil: number; // unix ms — use stale cache up to this time on failure
}

export interface UsePermissionCacheResult {
  permissions: CachedPermissions | null;
  loading:     boolean;
  stale:       boolean;
  refresh:     () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TTL_MS          = 10 * 60 * 1000;  // 10 minutes
const STALE_EXTRA_MS  =  5 * 60 * 1000;  // 5 extra minutes stale fallback
const BROADCAST_KEY   = "bidii_perm_invalidate";

function cacheKey(schoolId: string, userId: string) {
  return `permissions_${schoolId}_${userId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers — safe (SSR / private-browsing won't crash)
// ─────────────────────────────────────────────────────────────────────────────

function readCache(key: string): CachedPermissions | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CachedPermissions;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: CachedPermissions) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* quota */ }
}

function deleteCache(key: string) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-tab broadcast — notify siblings to re-fetch
// ─────────────────────────────────────────────────────────────────────────────

function broadcastInvalidation(schoolId: string, userId: string) {
  try {
    localStorage.setItem(
      BROADCAST_KEY,
      JSON.stringify({ schoolId, userId, t: Date.now() })
    );
    // Immediately remove so next write always fires the storage event
    localStorage.removeItem(BROADCAST_KEY);
  } catch { /* noop */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────────────────────

export function usePermissionCache(
  schoolId: string | null | undefined,
  userId:   string | null | undefined
): UsePermissionCacheResult {
  const pathname = usePathname();
  const key      = schoolId && userId ? cacheKey(schoolId, userId) : null;

  const [permissions, setPermissions] = useState<CachedPermissions | null>(() =>
    key ? readCache(key) : null
  );
  const [loading, setLoading] = useState(false);
  const [stale,   setStale]   = useState(false);

  const inFlightRef  = useRef(false);
  const mountedRef   = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Fetch from server ────────────────────────────────────────────────────
  const fetchPermissions = useCallback(async (force = false) => {
    if (!key || !schoolId || !userId) return;
    if (inFlightRef.current) return;

    // Check cache freshness
    const cached = readCache(key);
    if (!force && cached && cached.expiresAt > Date.now()) {
      if (mountedRef.current) setPermissions(cached);
      return;
    }

    inFlightRef.current = true;
    if (mountedRef.current) setLoading(true);

    try {
      const res = await fetch(`/api/permissions/effective`, {
        headers: { "Cache-Control": "no-store" },
      });

      if (res.status === 401 || res.status === 403) {
        // Session expired or revoked — let middleware redirect
        deleteCache(key);
        if (mountedRef.current) { setPermissions(null); setStale(false); }
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json() as Omit<CachedPermissions, "fetchedAt" | "expiresAt" | "staleUntil">;
      const now  = Date.now();
      const entry: CachedPermissions = {
        ...data,
        schoolId,
        userId,
        fetchedAt:  now,
        expiresAt:  now + TTL_MS,
        staleUntil: now + TTL_MS + STALE_EXTRA_MS,
      };
      writeCache(key, entry);
      if (mountedRef.current) { setPermissions(entry); setStale(false); }
    } catch {
      // On failure, serve stale cache if within stale window
      if (cached && cached.staleUntil > Date.now()) {
        if (mountedRef.current) { setPermissions(cached); setStale(true); }
      } else {
        // Cache completely dead — clear it
        deleteCache(key);
        if (mountedRef.current) { setPermissions(null); setStale(false); }
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [key, schoolId, userId]);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchPermissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ── Re-fetch on pathname change (Next.js navigation) ─────────────────────
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      prevPathRef.current = pathname;
      fetchPermissions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ── Re-fetch on tab focus ─────────────────────────────────────────────────
  useEffect(() => {
    function onFocus() { fetchPermissions(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchPermissions]);

  // ── Cross-tab invalidation listener ──────────────────────────────────────
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== BROADCAST_KEY || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as { schoolId: string; userId: string };
        if (msg.schoolId === schoolId && msg.userId === userId) {
          if (key) deleteCache(key);
          fetchPermissions(true);
        }
      } catch { /* malformed */ }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fetchPermissions, schoolId, userId, key]);

  // ── Public refresh — also broadcasts to other tabs ───────────────────────
  const refresh = useCallback(async () => {
    if (schoolId && userId) broadcastInvalidation(schoolId, userId);
    if (key) deleteCache(key);
    await fetchPermissions(true);
  }, [fetchPermissions, key, schoolId, userId]);

  return { permissions, loading, stale, refresh };
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone invalidation helper — call from API response interceptors or
// after a Principal changes permissions for the current user.
// ─────────────────────────────────────────────────────────────────────────────

function invalidatePermissionCache(schoolId: string, userId: string) {
  const key = cacheKey(schoolId, userId);
  deleteCache(key);
  broadcastInvalidation(schoolId, userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// 403 interceptor — patch global fetch so any 403 auto-invalidates the cache.
// Call installPermission403Interceptor() once in your root layout / provider.
// ─────────────────────────────────────────────────────────────────────────────

let interceptorInstalled = false;

export function installPermission403Interceptor(schoolId: string, userId: string) {
  if (interceptorInstalled || typeof window === "undefined") return;
  interceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 403) {
      invalidatePermissionCache(schoolId, userId);
    }
    return response;
  };
}
