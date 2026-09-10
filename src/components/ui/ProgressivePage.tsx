/**
 * src/components/ui/ProgressivePage.tsx
 *
 * Progressive rendering wrapper.
 *
 * Renders the page shell (header, filters, search bar, action buttons) on the
 * very first frame, with skeleton placeholder rows shown while data loads.
 * As soon as any data is available the real content replaces the skeletons —
 * no full-page loading spinner is ever shown.
 *
 * Usage:
 *   <ProgressivePage
 *     title="Students"
 *     description="Manage enrolment and class assignment."
 *     action={<button>Add student</button>}
 *     loading={storeLoading}
 *     empty={students.length === 0}
 *     emptyMessage="No students yet."
 *     skeletonRows={8}
 *   >
 *     <table>…real rows…</table>
 *   </ProgressivePage>
 */

"use client";

import React from "react";
import { PageHeader, EmptyState } from "@/components/ui";

// ---------------------------------------------------------------------------
// Skeleton primitives
// ---------------------------------------------------------------------------

/** A single animated shimmer bar. */
export function SkeletonBar({
  width = "100%",
  height = "0.875rem",
  className = "",
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-100 ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** A shimmer card block. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-100 ${className}`}
      aria-hidden="true"
    />
  );
}

/** A row of skeleton cells that looks like a premium table row. */
export function SkeletonTableRow({
  cols = 5,
  height = 56,
  hasAvatar = false,
}: {
  cols?: number;
  height?: number;
  hasAvatar?: boolean;
}) {
  return (
    <tr style={{ height }} aria-hidden="true" className="border-b border-border last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          {i === 0 && hasAvatar ? (
            <div className="flex items-center gap-3">
              {/* Avatar shimmer */}
              <div className="h-9 w-9 rounded-full bg-slate-100 animate-pulse shrink-0" />
              <div className="space-y-1.5">
                <SkeletonBar width="120px" height="0.75rem" />
                <SkeletonBar width="80px" height="0.625rem" />
              </div>
            </div>
          ) : (
            <SkeletonBar
              width={
                i === cols - 1
                  ? "60px"
                  : i === cols - 2
                  ? "80px"
                  : i % 3 === 0
                  ? "65%"
                  : i % 3 === 1
                  ? "50%"
                  : "75%"
              }
              height="0.75rem"
            />
          )}
        </td>
      ))}
    </tr>
  );
}

/** A stat card skeleton (for dashboard overview). */
export function SkeletonStatCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3" aria-hidden="true">
      <SkeletonBar width="45%" height="1.75rem" />
      <SkeletonBar width="65%" height="0.75rem" />
      <SkeletonBar width="40%" height="0.625rem" />
    </div>
  );
}

/** A message card skeleton for the messaging list. */
export function SkeletonMessageCard() {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 space-y-2.5 animate-pulse" aria-hidden="true">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <SkeletonBar width="56px" height="0.625rem" className="rounded-full" />
          <SkeletonBar width="48px" height="0.625rem" className="rounded-full" />
        </div>
        <SkeletonBar width="36px" height="0.625rem" />
      </div>
      <SkeletonBar width="60%" height="0.625rem" />
      <SkeletonBar width="85%" height="0.75rem" />
    </div>
  );
}

/** The premium table container shell shown while loading. */
export function SkeletonTable({
  rows = 6,
  cols = 5,
  hasAvatar = false,
}: {
  rows?: number;
  cols?: number;
  hasAvatar?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Fake header row */}
      <div className="border-b border-border bg-slate-50/60 px-5 py-3.5 flex items-center gap-6" aria-hidden="true">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBar
            key={i}
            width={i === 0 ? "120px" : i === cols - 1 ? "64px" : `${60 + (i * 13) % 40}px`}
            height="0.625rem"
          />
        ))}
      </div>
      <table className="w-full" aria-busy="true" aria-label="Loading…">
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cols={cols} hasAvatar={hasAvatar && i < rows} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ProgressivePageProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Extra content rendered between the header and the main content (e.g. search bar). */
  toolbar?: React.ReactNode;
  /** True while the store is still loading from IndexedDB (first mount only). */
  loading: boolean;
  /** True when there is no data after loading completes. */
  empty?: boolean;
  emptyMessage?: string;
  /** Number of skeleton rows to render while loading. */
  skeletonRows?: number;
  /** Number of columns in the skeleton table. */
  skeletonCols?: number;
  /** Whether the first skeleton column should show an avatar stub. */
  skeletonHasAvatar?: boolean;
  children: React.ReactNode;
  /** When true, renders skeleton stat cards instead of a table. */
  variant?: "table" | "cards" | "custom";
  /** Number of stat card skeletons to render (variant=cards). */
  skeletonCardCount?: number;
}

export function ProgressivePage({
  title,
  description,
  action,
  toolbar,
  loading,
  empty = false,
  emptyMessage = "Nothing here yet.",
  skeletonRows = 6,
  skeletonCols = 5,
  skeletonHasAvatar = false,
  children,
  variant = "table",
  skeletonCardCount = 4,
}: ProgressivePageProps) {
  return (
    <div>
      {/* Header always renders immediately — navigation never blocks */}
      <PageHeader title={title} description={description} action={action} />

      {/* Toolbar (search + filters) always renders immediately */}
      {toolbar && <div className="mt-4 mb-4">{toolbar}</div>}

      {/* Content area */}
      {loading ? (
        // ── Skeleton state — same layout as real content ─────────────────
        variant === "table" ? (
          <SkeletonTable
            rows={skeletonRows}
            cols={skeletonCols}
            hasAvatar={skeletonHasAvatar}
          />
        ) : variant === "cards" ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: skeletonCardCount }).map((_, i) => (
              <SkeletonStatCard key={i} />
            ))}
          </div>
        ) : (
          // custom — caller renders their own skeleton via children
          children
        )
      ) : empty ? (
        <EmptyState message={emptyMessage} />
      ) : (
        children
      )}
    </div>
  );
}

export default ProgressivePage;
