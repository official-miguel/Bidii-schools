"use client";

/**
 * NotificationList
 *
 * Client component that manages parent notification state:
 *  - Groups by date (TODAY / YESTERDAY / EARLIER)
 *  - URGENT/HIGH notifications get a left border accent
 *  - Clicking a card optimistically marks it as read (PATCH /api/parent/notifications/:id/read)
 *  - "Mark all as read" button (POST /api/parent/notifications/read-all)
 *  - "Load more" pagination button
 *  - Empty state when no notifications exist
 */

import { useState } from "react";
import type { ParentNotification } from "@prisma/client";

interface Props {
  initialNotifications: ParentNotification[];
  total: number;
  unreadCount: number;
}

// ─── Module colour map ────────────────────────────────────────────────────────
const MODULE_BADGE: Record<string, string> = {
  DIARY:        "bg-blue-100 text-blue-700",
  ACADEMIC:     "bg-purple-100 text-purple-700",
  ATTENDANCE:   "bg-orange-100 text-orange-700",
  FEES:         "bg-green-100 text-green-700",
  BEHAVIOUR:    "bg-red-100 text-red-700",
  ACHIEVEMENTS: "bg-yellow-100 text-yellow-700",
  CALENDAR:     "bg-teal-50 text-teal-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupLabel(createdAt: Date | string): "TODAY" | "YESTERDAY" | "EARLIER" {
  const now = new Date();
  const todayMs = startOfDay(now);
  const d = new Date(createdAt);
  const dMs = startOfDay(d);
  if (dMs === todayMs) return "TODAY";
  if (dMs === todayMs - 86_400_000) return "YESTERDAY";
  return "EARLIER";
}

function relativeTime(createdAt: Date | string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(createdAt).toLocaleDateString();
}

function leftBorder(priority: string): string {
  if (priority === "URGENT") return "border-l-4 border-danger";
  if (priority === "HIGH")   return "border-l-4 border-warn";
  return "";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NotificationList({ initialNotifications, total, unreadCount: _unreadCount }: Props) {
  const [notifications, setNotifications] = useState<ParentNotification[]>(initialNotifications);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  // ── Mark single as read ────────────────────────────────────────────────────
  async function markRead(id: string) {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, isRead: true, readAt: new Date() } : n)
    );
    try {
      await fetch(`/api/parent/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      // Non-critical — UI already updated
    }
  }

  // ── Mark all as read ───────────────────────────────────────────────────────
  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    // Optimistic
    const now = new Date();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: now })));
    try {
      await fetch("/api/parent/notifications/read-all", { method: "POST" });
    } catch {
      // Non-critical
    } finally {
      setMarkingAll(false);
    }
  }

  // ── Load more ──────────────────────────────────────────────────────────────
  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetch(`/api/parent/notifications?page=${nextPage}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications((prev) => [...prev, ...(data.notifications ?? [])]);
        setPage(nextPage);
      }
    } catch {
      // Swallow
    } finally {
      setLoadingMore(false);
    }
  }

  // ── Group notifications ────────────────────────────────────────────────────
  const groups: Record<"TODAY" | "YESTERDAY" | "EARLIER", ParentNotification[]> = {
    TODAY: [],
    YESTERDAY: [],
    EARLIER: [],
  };
  for (const n of notifications) {
    groups[groupLabel(n.createdAt)].push(n);
  }

  const hasUnread = notifications.some((n) => !n.isRead);
  const canLoadMore = notifications.length < total;

  // ── Empty state ───────────────────────────────────────────────────────────
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-4xl mb-3" aria-hidden="true">🔔</span>
        <p className="font-semibold text-ink text-lg">You&apos;re all caught up</p>
        <p className="text-slate text-sm mt-1">There are no notifications.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Actions bar ──────────────────────────────────────────────────────── */}
      {hasUnread && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll}
            className="text-sm text-teal hover:underline disabled:opacity-50"
          >
            {markingAll ? "Marking…" : "Mark all as read"}
          </button>
        </div>
      )}

      {/* ── Grouped sections ─────────────────────────────────────────────────── */}
      {(["TODAY", "YESTERDAY", "EARLIER"] as const).map((group) => {
        const items = groups[group];
        if (items.length === 0) return null;

        const groupTitle =
          group === "TODAY"     ? "Today" :
          group === "YESTERDAY" ? "Yesterday" :
          "Earlier";

        return (
          <section key={group}>
            <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-2 px-1">
              {groupTitle}
            </h3>
            <ul className="flex flex-col gap-2">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => { if (!n.isRead) markRead(n.id); }}
                    className={[
                      "w-full text-left rounded-xl px-4 py-3",
                      "bg-white dark:bg-dark-surface",
                      "border border-line dark:border-dark-border",
                      "hover:border-teal/40 transition-colors",
                      "relative flex items-start gap-3",
                      leftBorder(n.priority),
                    ].filter(Boolean).join(" ")}
                  >
                    {/* Unread dot */}
                    {!n.isRead && (
                      <span
                        aria-label="Unread"
                        className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-blue-500"
                      />
                    )}

                    {/* Content */}
                    <div className={`flex-1 min-w-0 ${n.isRead ? "" : ""}`}>
                      {/* Module badge + time */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={[
                            "text-[11px] font-medium px-2 py-0.5 rounded-full",
                            MODULE_BADGE[n.module] ?? "bg-paper text-slate",
                          ].join(" ")}
                        >
                          {n.module}
                        </span>
                        <span className="text-[11px] text-slate ml-auto">
                          {relativeTime(n.createdAt)}
                        </span>
                      </div>

                      {/* Title */}
                      <p className={`text-sm text-ink dark:text-dark-text leading-snug ${!n.isRead ? "font-semibold" : "font-medium"}`}>
                        {n.title}
                      </p>

                      {/* Body */}
                      <p className="text-sm text-slate dark:text-dark-muted mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* ── Load more ─────────────────────────────────────────────────────────── */}
      {canLoadMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-lg border border-line text-sm text-slate
                       hover:border-teal/40 hover:text-teal transition-colors
                       disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
