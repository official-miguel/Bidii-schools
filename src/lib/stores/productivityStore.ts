/**
 * src/lib/stores/productivityStore.ts
 *
 * Zustand store for Stage 8 productivity features:
 *   - Notifications (in-memory with localStorage persistence)
 *   - Favorites (pinned nav items, actions)
 *   - Recent activity / continue-working (last visited pages)
 *
 * All state is persisted to localStorage so it survives page reloads.
 * No server round-trips — this is purely client-side productivity UX.
 */

"use client";

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | "academic"
  | "communication"
  | "attendance"
  | "library"
  | "examination"
  | "administrative";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  timestamp: number; // Date.now()
  read: boolean;
  /** Optional deep-link (href) to navigate to on click */
  href?: string;
  /** Optional quick-action label + href pair shown inline */
  action?: { label: string; href: string };
}

export interface FavoriteItem {
  id: string;
  label: string;
  href: string;
  icon: string; // lucide icon name string, e.g. "Users"
  category: "module" | "action" | "report";
  pinnedAt: number;
}

export interface RecentPage {
  href: string;
  label: string;
  icon: string;
  visitedAt: number;
  /** hub the page belongs to, e.g. "academics" */
  hub?: string;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  notifications: "bidii_notifications",
  favorites:     "bidii_favorites",
  recents:       "bidii_recents",
} as const;

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded — fail silently */ }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ProductivityState {
  // ── Notifications ─────────────────────────────────────────────────────────
  notifications:      AppNotification[];
  /** Active category filter; null = show all */
  notifFilter:        NotificationCategory | null;

  addNotification:    (n: Omit<AppNotification, "id" | "read" | "timestamp">) => void;
  /** Merges server-fetched notifications in by id — skips ones already present. */
  hydrateNotifications: (items: AppNotification[]) => void;
  markRead:           (id: string) => void;
  markAllRead:        () => void;
  dismissNotification:(id: string) => void;
  clearAllNotifications: () => void;
  setNotifFilter:     (cat: NotificationCategory | null) => void;

  // ── Favorites ─────────────────────────────────────────────────────────────
  favorites: FavoriteItem[];

  addFavorite:    (item: Omit<FavoriteItem, "pinnedAt">) => void;
  removeFavorite: (id: string) => void;
  toggleFavorite: (item: Omit<FavoriteItem, "pinnedAt">) => void;

  // ── Recent pages ──────────────────────────────────────────────────────────
  recents: RecentPage[];

  trackVisit: (page: Omit<RecentPage, "visitedAt">) => void;
  clearRecents: () => void;
}

export const useProductivityStore = create<ProductivityState>((set, get) => {
  // Load persisted state on creation (client-side only)
  const initNotifs   = load<AppNotification[]>(STORAGE_KEYS.notifications, []);
  const initFavs     = load<FavoriteItem[]>(STORAGE_KEYS.favorites, []);
  const initRecents  = load<RecentPage[]>(STORAGE_KEYS.recents, []);

  return {
    // ── Notifications ──────────────────────────────────────────────────────
    notifications: initNotifs,
    notifFilter: null,

    addNotification(partial) {
      const n: AppNotification = {
        ...partial,
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        read: false,
        timestamp: Date.now(),
      };
      set((s) => {
        // Cap at 100 notifications, newest first
        const updated = [n, ...s.notifications].slice(0, 100);
        save(STORAGE_KEYS.notifications, updated);
        return { notifications: updated };
      });
    },

    hydrateNotifications(items) {
      set((s) => {
        const existingIds = new Set(s.notifications.map((n) => n.id));
        const fresh = items.filter((n) => !existingIds.has(n.id));
        if (fresh.length === 0) return s;
        const updated = [...fresh, ...s.notifications]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 100);
        save(STORAGE_KEYS.notifications, updated);
        return { notifications: updated };
      });
    },

    markRead(id) {
      set((s) => {
        const updated = s.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        );
        save(STORAGE_KEYS.notifications, updated);
        return { notifications: updated };
      });
    },

    markAllRead() {
      set((s) => {
        const updated = s.notifications.map((n) => ({ ...n, read: true }));
        save(STORAGE_KEYS.notifications, updated);
        return { notifications: updated };
      });
    },

    dismissNotification(id) {
      set((s) => {
        const updated = s.notifications.filter((n) => n.id !== id);
        save(STORAGE_KEYS.notifications, updated);
        return { notifications: updated };
      });
    },

    clearAllNotifications() {
      save(STORAGE_KEYS.notifications, []);
      set({ notifications: [] });
    },

    setNotifFilter(cat) {
      set({ notifFilter: cat });
    },

    // ── Favorites ──────────────────────────────────────────────────────────
    favorites: initFavs,

    addFavorite(item) {
      const existing = get().favorites.find((f) => f.id === item.id);
      if (existing) return;
      set((s) => {
        const updated = [...s.favorites, { ...item, pinnedAt: Date.now() }];
        save(STORAGE_KEYS.favorites, updated);
        return { favorites: updated };
      });
    },

    removeFavorite(id) {
      set((s) => {
        const updated = s.favorites.filter((f) => f.id !== id);
        save(STORAGE_KEYS.favorites, updated);
        return { favorites: updated };
      });
    },

    toggleFavorite(item) {
      const isFav = get().favorites.some((f) => f.id === item.id);
      if (isFav) {
        get().removeFavorite(item.id);
      } else {
        get().addFavorite(item);
      }
    },

    // ── Recent pages ───────────────────────────────────────────────────────
    recents: initRecents,

    trackVisit(page) {
      set((s) => {
        // Remove duplicate, prepend, cap at 20
        const filtered = s.recents.filter((r) => r.href !== page.href);
        const updated = [
          { ...page, visitedAt: Date.now() },
          ...filtered,
        ].slice(0, 20);
        save(STORAGE_KEYS.recents, updated);
        return { recents: updated };
      });
    },

    clearRecents() {
      save(STORAGE_KEYS.recents, []);
      set({ recents: [] });
    },
  };
});
