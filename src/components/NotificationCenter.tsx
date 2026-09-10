"use client";

/**
 * src/components/NotificationCenter.tsx
 *
 * Dropdown notification center attached to the Bell icon in TopAppBar.
 *
 * Features:
 *   - Grouped by category: academic, communication, attendance,
 *     library, examination, administrative
 *   - Unread badge on Bell icon
 *   - Mark single / all as read
 *   - Dismiss individual notifications
 *   - Category filter tabs
 *   - Relative timestamps
 *   - Quick-action button per notification
 *   - Closes on outside click or Esc
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  X,
  CheckCheck,
  BookOpen,
  MessageSquare,
  ClipboardCheck,
  Library,
  BookOpenCheck,
  Settings2,
  Circle,
  Trash2,
} from "lucide-react";
import {
  useProductivityStore,
  type NotificationCategory,
  type AppNotification,
} from "@/lib/stores/productivityStore";

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const CAT_META: Record<
  NotificationCategory,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  academic:       { label: "Academic",       Icon: BookOpen        },
  communication:  { label: "Communication",  Icon: MessageSquare   },
  attendance:     { label: "Attendance",     Icon: ClipboardCheck  },
  library:        { label: "Library",        Icon: Library         },
  examination:    { label: "Examination",    Icon: BookOpenCheck   },
  administrative: { label: "Admin",          Icon: Settings2       },
};

const FILTER_TABS: Array<{ value: NotificationCategory | null; label: string }> = [
  { value: null,             label: "All"     },
  { value: "academic",       label: "Academic"},
  { value: "communication",  label: "Messages"},
  { value: "attendance",     label: "Attend." },
  { value: "library",        label: "Library" },
  { value: "examination",    label: "Exams"   },
  { value: "administrative", label: "Admin"   },
];

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NotifCard({
  notif,
  onRead,
  onDismiss,
  onAction,
}: {
  notif: AppNotification;
  onRead: () => void;
  onDismiss: () => void;
  onAction: (href: string) => void;
}) {
  const meta = CAT_META[notif.category] ?? {
    label: notif.category,
    Icon: Circle,
  };
  const CatIcon = meta.Icon;

  return (
    <div
      className={`relative flex gap-3 px-4 py-3 cursor-pointer group
                  transition-colors hover:bg-background/50
                  ${notif.read ? "" : "bg-teal-50/60 dark:bg-teal-900/10"}`}
      onClick={onRead}
    >
      {/* Category icon dot */}
      <div
        className={`shrink-0 mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center
                    ${notif.read
                      ? "bg-background text-slate"
                      : "bg-teal/10 text-teal"}`}
      >
        <CatIcon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm leading-snug truncate
                        ${notif.read
                          ? "font-normal text-foreground/80/80"
                          : "font-semibold text-foreground"}`}
          >
            {notif.title}
          </p>
          <span className="text-[11px] text-slate/70/70 shrink-0 mt-0.5">
            {relativeTime(notif.timestamp)}
          </span>
        </div>

        <p className="text-xs text-slate mt-0.5 line-clamp-2">
          {notif.body}
        </p>

        {notif.action && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRead(); // mark as read when navigating via action link
              onAction(notif.action!.href);
            }}
            className="mt-1.5 text-xs font-medium text-teal hover:underline"
          >
            {notif.action.label} →
          </button>
        )}
      </div>

      {/* Unread dot */}
      {!notif.read && (
        <span
          aria-label="Unread"
          className="absolute top-3 right-10 w-2 h-2 rounded-full bg-teal"
        />
      )}

      {/* Dismiss button — shown on hover */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss notification"
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100
                   text-slate hover:text-danger transition-opacity dark:hover:text-danger"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ isOpen, onClose }: Props) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const notifications = useProductivityStore((s) => s.notifications);
  const notifFilter   = useProductivityStore((s) => s.notifFilter);
  // Actions accessed via getState() — Zustand creates a new function reference
  // on every state update, so subscribing reactively would cause unnecessary
  // re-renders on every notification change.

  const count = notifications.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  // Close on Esc
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const visible = notifFilter
    ? notifications.filter((n) => n.category === notifFilter)
    : notifications;

  /**
   * Navigate to a notification action href.
   *
   * Guards:
   *  - Ignores empty / missing hrefs so a bad notification config never
   *    triggers an unintended navigation (which would hit the middleware
   *    and bounce the user to /login).
   *  - Only follows same-origin paths (starts with "/") — external URLs
   *    are silently discarded to prevent open-redirect issues.
   */
  function handleAction(href: string) {
    if (!href || !href.startsWith("/")) return;
    router.push(href);
    onClose();
  }

  return (
    <>
      {/* Bell trigger button — always rendered so parent can position it */}
      {/* This component is the panel only; the trigger sits in TopAppBar */}

      {isOpen && (
        <div
          ref={panelRef}
          role="region"
          aria-label="Notification center"
          className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)]
                     rounded-xl bg-card border border-border shadow-xl z-50
                     animate-scale-in origin-top-right"
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3
                          border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate" />
              <h2 className="text-sm font-semibold text-foreground">
                Notifications
              </h2>
              {count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold
                                 bg-teal text-white leading-none">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => useProductivityStore.getState().markAllRead()}
                  title="Mark all as read"
                  className="flex items-center justify-center w-7 h-7 rounded-md
                             text-slate hover:bg-teal-50 hover:text-teal transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => useProductivityStore.getState().clearAllNotifications()}
                  title="Clear all notifications"
                  className="flex items-center justify-center w-7 h-7 rounded-md
                             text-slate hover:bg-danger/10 hover:text-danger transition-colors dark:hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close notifications"
                className="flex items-center justify-center w-7 h-7 rounded-md
                           text-slate hover:bg-background transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* ── Category filter tabs ─────────────────────────────────── */}
          <div className="flex gap-0.5 px-3 py-2 overflow-x-auto
                          border-b border-border
                          scrollbar-none">
            {FILTER_TABS.map((tab) => {
              const active = notifFilter === tab.value;
              const tabCount =
                tab.value === null
                  ? notifications.filter((n) => !n.read).length
                  : notifications.filter(
                      (n) => n.category === tab.value && !n.read
                    ).length;

              return (
                <button
                  key={String(tab.value)}
                  type="button"
                  onClick={() => useProductivityStore.getState().setNotifFilter(tab.value)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md
                              text-xs font-medium whitespace-nowrap transition-colors shrink-0
                              ${active
                                ? "bg-teal text-white"
                                : "text-slate hover:bg-background hover:text-foreground"
                              }`}
                >
                  {tab.label}
                  {tabCount > 0 && (
                    <span
                      className={`text-[10px] font-bold leading-none rounded-full px-1 py-0.5
                                  ${active ? "bg-card/20 text-white" : "bg-teal/10 text-teal"}`}
                    >
                      {tabCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Notification list ─────────────────────────────────────── */}
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border ">
            {visible.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="h-9 w-9 mx-auto text-slate/30/30 mb-3" />
                <p className="text-sm text-slate">
                  {notifFilter
                    ? `No ${CAT_META[notifFilter]?.label ?? notifFilter} notifications`
                    : "You're all caught up"}
                </p>
              </div>
            ) : (
              visible.map((notif) => (
                <NotifCard
                  key={notif.id}
                  notif={notif}
                  onRead={() => useProductivityStore.getState().markRead(notif.id)}
                  onDismiss={() => useProductivityStore.getState().dismissNotification(notif.id)}
                  onAction={handleAction}
                />
              ))
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          {visible.length > 0 && (
            <div className="px-4 py-2 border-t border-border
                            bg-background/50/50 rounded-b-xl">
              <p className="text-[11px] text-slate/70/70 text-center">
                {visible.length} notification{visible.length === 1 ? "" : "s"}
                {notifFilter ? ` in ${CAT_META[notifFilter]?.label}` : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Bell button with badge — used by TopAppBar
// ---------------------------------------------------------------------------

export function NotificationBell({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  const notifications = useProductivityStore((s) => s.notifications);
  const count = notifications.filter((n) => !n.read).length;

  // Defer badge rendering to the client to avoid SSR/client hydration mismatch.
  // The server always renders the button with no badge (count = 0 on server),
  // and the badge appears after mount once the client store is ready.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const displayCount = mounted ? count : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Notifications${displayCount > 0 ? `, ${displayCount} unread` : ""}`}
      aria-expanded={isOpen}
      className={`relative flex items-center justify-center w-9 h-9 rounded-lg
                  transition-colors
                  ${isOpen
                    ? "bg-teal-50 text-teal dark:bg-teal-900/20 dark:text-teal"
                    : "text-slate hover:bg-teal-50 hover:text-teal"
                  }`}
    >
      <Bell className="h-4.5 w-4.5" />
      {displayCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1
                     rounded-full bg-teal text-white text-[10px] font-bold
                     flex items-center justify-center leading-none"
        >
          {displayCount > 9 ? "9+" : displayCount}
        </span>
      )}
    </button>
  );
}
