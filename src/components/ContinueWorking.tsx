"use client";

/**
 * src/components/ContinueWorking.tsx
 *
 * "Continue Working" strip — shown on the home dashboard page.
 * Renders the last N visited pages so users can resume immediately.
 *
 * Also exports:
 *   - RecentActivityList  — standalone vertical list variant for
 *                           sidebar widgets or modal panels
 */

import { useRouter } from "next/navigation";
import { Clock, X, Trash2 } from "lucide-react";
import {
  useProductivityStore,
  type RecentPage,
} from "@/lib/stores/productivityStore";
import { getLucideIcon } from "@/lib/utils/lucideIcon";

// How many items to show in the horizontal strip
const STRIP_MAX = 6;

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// ContinueWorking — horizontal card strip
// ---------------------------------------------------------------------------

interface ContinueWorkingProps {
  /** Max items to show */
  max?: number;
}

export default function ContinueWorking({ max = STRIP_MAX }: ContinueWorkingProps) {
  const router  = useRouter();
  const recents = useProductivityStore((s) => s.recents);

  if (recents.length === 0) return null;

  const items = recents.slice(0, max);

  function navigate(page: RecentPage) {
    router.push(page.href);
  }

  return (
    <section aria-labelledby="continue-working-heading" className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate" />
          <h2
            id="continue-working-heading"
            className="text-sm font-semibold text-foreground"
          >
            Continue Working
          </h2>
        </div>
        <button
          type="button"
          onClick={() => useProductivityStore.getState().clearRecents()}
          className="flex items-center gap-1 text-xs text-slate hover:text-danger
                     transition-colors dark:hover:text-danger"
          aria-label="Clear recent history"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {items.map((page) => {
          const Icon = getLucideIcon(page.icon);

          return (
            <button
              key={page.href}
              type="button"
              onClick={() => navigate(page)}
              className="flex flex-col items-start gap-2 p-3 rounded-xl
                         border border-border bg-card min-w-[160px] max-w-[200px]
                         hover:border-teal/40 hover:shadow-sm transition-all
                         dark:hover:border-teal/40"
            >
              <div
                className="w-9 h-9 rounded-lg bg-teal/10 text-teal
                           flex items-center justify-center shrink-0"
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
              </div>
              <div className="text-left min-w-0 w-full">
                <p className="text-sm font-medium text-foreground truncate">
                  {page.label}
                </p>
                <p className="text-xs text-slate mt-0.5">
                  {relTime(page.visitedAt)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// RecentActivityList — compact vertical list
// ---------------------------------------------------------------------------

interface ListProps {
  max?: number;
  onNavigate?: () => void;
}

export function RecentActivityList({ max = 8, onNavigate }: ListProps) {
  const router  = useRouter();
  const recents = useProductivityStore((s) => s.recents);

  const items = recents.slice(0, max);

  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <Clock className="h-8 w-8 mx-auto text-slate/30/30 mb-2" />
        <p className="text-sm text-slate">
          No recent activity yet
        </p>
      </div>
    );
  }

  function go(href: string) {
    router.push(href);
    onNavigate?.();
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2
                      border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-slate" />
          <span className="text-xs font-semibold text-slate uppercase tracking-wider">
            Recent
          </span>
        </div>
        <button
          type="button"
          onClick={() => useProductivityStore.getState().clearRecents()}
          className="text-xs text-slate/60 hover:text-danger transition-colors/60 dark:hover:text-danger"
        >
          Clear
        </button>
      </div>

      <div className="py-1 divide-y divide-border ">
        {items.map((page) => {
          const Icon = getLucideIcon(page.icon);

          return (
            <button
              key={page.href}
              type="button"
              onClick={() => go(page.href)}
              className="w-full flex items-center gap-3 px-4 py-2.5
                         hover:bg-background transition-colors text-left
                        /50"
            >
              <div
                className="shrink-0 w-8 h-8 rounded-lg bg-background text-slate
                           flex items-center justify-center"
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {page.label}
                </p>
              </div>
              <span className="text-[11px] text-slate/60/60 shrink-0">
                {relTime(page.visitedAt)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecentItem remove helper exported separately
// ---------------------------------------------------------------------------

export function RemoveRecentButton({ href }: { href: string }) {
  const recents = useProductivityStore((s) => s.recents);

  const hasItem = recents.some((r) => r.href === href);
  if (!hasItem) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const rest = recents.filter((r) => r.href !== href);
        useProductivityStore.getState().clearRecents();
        // Re-add in reverse so oldest is tracked first → newest last
        // (trackVisit prepends, so iterate reversed)
        [...rest].reverse().forEach((r) => {
          useProductivityStore.getState().trackVisit(r);
        });
      }}
      aria-label="Remove from recents"
      className="text-slate/40 hover:text-danger transition-colors/40 dark:hover:text-danger"
    >
      <X className="h-3 w-3" />
    </button>
  );
}
