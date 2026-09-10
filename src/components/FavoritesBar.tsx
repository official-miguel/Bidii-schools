"use client";

/**
 * src/components/FavoritesBar.tsx
 *
 * A horizontal strip of pinned favorite items rendered just below the
 * TopAppBar (inside the page content area). Only visible when the user
 * has at least one favorite pinned.
 *
 * Also exports:
 *   - FavoriteToggleButton  — pin/unpin icon rendered on any page header
 *   - useFavoriteable       — hook that returns current pin state + toggle for
 *                             a given page/action ID
 */

import { useRouter } from "next/navigation";
import { Star, StarOff, X } from "lucide-react";
import {
  useProductivityStore,
  type FavoriteItem,
} from "@/lib/stores/productivityStore";
import { getLucideIcon } from "@/lib/utils/lucideIcon";

// ---------------------------------------------------------------------------
// FavoritesBar
// ---------------------------------------------------------------------------

interface FavoritesBarProps {
  /** role prefix for aria / analytics — not used for routing (hrefs are absolute) */
  role?: string;
}

export default function FavoritesBar({ role: _role }: FavoritesBarProps) {
  const router    = useRouter();
  const favorites = useProductivityStore((s) => s.favorites);

  if (favorites.length === 0) return null;

  // Sort by most recently pinned first
  const sorted = [...favorites].sort((a, b) => b.pinnedAt - a.pinnedAt);

  function navigate(fav: FavoriteItem) {
    router.push(fav.href);
  }

  return (
    <div
      aria-label="Favorites"
      className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto scrollbar-none
                 bg-background border-b border-border"
    >
      <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" strokeWidth={2.5} />
      <span className="text-[11px] font-semibold text-slate uppercase tracking-wider
                       mr-1 shrink-0">
        Pinned
      </span>

      {sorted.map((fav) => {
        const Icon = getLucideIcon(fav.icon);

        return (
          <div
            key={fav.id}
            className="flex items-center gap-0 shrink-0 group"
          >
            <button
              type="button"
              onClick={() => navigate(fav)}
              className="flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-l-lg
                         border border-r-0 border-border text-xs font-medium
                         text-slate hover:text-teal hover:border-teal/40 hover:bg-teal-50
                         transition-colors
                         dark:hover:text-teal dark:hover:bg-teal-900/10"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              <span className="max-w-[120px] truncate">{fav.label}</span>
            </button>
            <button
              type="button"
              onClick={() => useProductivityStore.getState().removeFavorite(fav.id)}
              aria-label={`Unpin ${fav.label}`}
              className="h-7 w-6 flex items-center justify-center rounded-r-lg
                         border border-border text-slate/40 opacity-0 group-hover:opacity-100
                         hover:bg-danger/10 hover:text-danger hover:border-danger/30
                         transition-all/40"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FavoriteToggleButton — pin/unpin a specific item
// ---------------------------------------------------------------------------

interface ToggleProps {
  item: Omit<FavoriteItem, "pinnedAt">;
  /** Size variant */
  size?: "sm" | "md";
}

export function FavoriteToggleButton({ item, size = "md" }: ToggleProps) {
  const favorites = useProductivityStore((s) => s.favorites);

  const pinned = favorites.some((f) => f.id === item.id);
  const cls = size === "sm"
    ? "w-7 h-7 rounded-md"
    : "w-8 h-8 rounded-lg";

  return (
    <button
      type="button"
      onClick={() => useProductivityStore.getState().toggleFavorite(item)}
      aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label} to favorites`}
      title={pinned ? "Remove from favorites" : "Add to favorites"}
      className={`flex items-center justify-center ${cls} transition-colors
                  ${pinned
                    ? "text-amber-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10"
                    : "text-slate/50 hover:text-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-900/10"
                  }`}
    >
      {pinned ? (
        <Star className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}`} fill="currentColor" />
      ) : (
        <StarOff className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// useFavoriteable — convenience hook for page-level pin state
// ---------------------------------------------------------------------------

export function useFavoriteable(item: Omit<FavoriteItem, "pinnedAt">) {
  const favorites = useProductivityStore((s) => s.favorites);

  return {
    pinned: favorites.some((f) => f.id === item.id),
    toggle: () => useProductivityStore.getState().toggleFavorite(item),
  };
}
