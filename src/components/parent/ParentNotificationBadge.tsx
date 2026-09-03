"use client";

/**
 * ParentNotificationBadge
 *
 * Polls /api/parent/notifications?page=1 every 60 seconds and renders a
 * red circular badge with the unread count when there are unread
 * notifications.  Count is capped at "99+" for display.
 *
 * Returns null when `role` is not "parent".
 */

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

interface Props {
  role?: string;
  /** Called when the bell button is clicked. */
  onClick?: () => void;
  /** Whether the notification panel is open (used for aria-expanded). */
  isOpen?: boolean;
}

export default function ParentNotificationBadge({ role, onClick, isOpen = false }: Props) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Only poll when role is parent
  useEffect(() => {
    if (role !== "parent") return;

    let mounted = true;

    async function fetchUnread() {
      try {
        const res = await fetch("/api/parent/notifications?page=1", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && typeof data.unreadCount === "number") {
          setUnreadCount(data.unreadCount);
        }
      } catch {
        // Swallow — badge is non-critical
      }
    }

    fetchUnread();
    const id = setInterval(fetchUnread, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [role]);

  if (role !== "parent") return null;

  const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);

  const iconBtn =
    "flex items-center justify-center w-11 h-11 rounded-lg transition-colors duration-100 " +
    "text-slate hover:bg-teal-50 hover:text-teal " +
    "dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      aria-expanded={isOpen}
      className={`relative ${iconBtn}`}
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1
                     flex items-center justify-center
                     rounded-full bg-danger text-white text-[10px] font-semibold
                     leading-none select-none pointer-events-none"
        >
          {displayCount}
        </span>
      )}
    </button>
  );
}
