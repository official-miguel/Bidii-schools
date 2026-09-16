"use client";

/**
 * Polls the shared server notification inbox (/api/notifications) and merges
 * results into the existing client-side notification store, so the same
 * Bell/NotificationCenter UI shows both locally-generated hints (favorited,
 * etc.) and real server-driven ones (lesson reminders, discipline cases,
 * fee payments, ...). Server rows are prefixed "srv:" so NotificationCenter
 * can route mark-read/dismiss back to the API for those specifically.
 */

import { useEffect } from "react";
import {
  useProductivityStore,
  type NotificationCategory,
} from "@/lib/stores/productivityStore";

const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  LESSON_REMINDER:     "academic",
  DISCIPLINE_CASE:     "administrative",
  CALENDAR_DEADLINE:   "academic",
  CALENDAR_UPDATED:    "academic",
  ATTENDANCE_REMINDER: "attendance",
  ATTENDANCE_ABSENT:   "attendance",
  RESULTS_RELEASED:    "examination",
  FEES_PAYMENT:        "administrative",
  FINANCE_TRANSACTION: "administrative",
  DIARY_POSTED:        "communication",
  PRINCIPAL_ALERT:     "administrative",
};

interface ServerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
}

const POLL_MS = 30_000;

export default function ServerNotificationSync() {
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/notifications?limit=50", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const rows: ServerNotification[] = await res.json();

        useProductivityStore.getState().hydrateNotifications(
          rows.map((n) => ({
            id:        `srv:${n.id}`,
            category:  TYPE_TO_CATEGORY[n.type] ?? "administrative",
            title:     n.title,
            body:      n.body,
            timestamp: new Date(n.createdAt).getTime(),
            read:      n.isRead,
            href:      n.href ?? undefined,
          }))
        );
      } catch {
        // Offline or transient failure — next poll will retry.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return null;
}
