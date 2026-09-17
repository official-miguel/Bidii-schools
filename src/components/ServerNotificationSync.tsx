"use client";

/**
 * Polls the server notification inboxes and reconciles them into the shared
 * client store, so the single Bell/NotificationCenter in the top bar shows
 * everything the signed-in person has been sent.
 *
 * There are two separate server inboxes, and both feed this one bell:
 *
 *   srv:  Notification        — staff-facing rows (lesson reminders, discipline
 *                               cases, exam analysis, fee transactions ...).
 *                               Parents can receive these too: the calendar
 *                               deadline rule notifies users with role PARENT.
 *   pn:   ParentNotification  — the parent portal's own per-child rows (diary,
 *                               attendance, behaviour, achievements, fees).
 *
 * Before this, the parent bell read only ParentNotification and the staff bell
 * only Notification, so any Notification addressed to a parent was written to
 * the database and then had nowhere to appear. Pulling both here is what makes
 * "every notification lands in the bell" actually true.
 *
 * Ids are prefixed per source so NotificationCenter can route mark-read and
 * dismiss back to the right endpoint, and so each poll can replace only its
 * own rows without disturbing locally-generated ones.
 */

import { useEffect } from "react";
import {
  useProductivityStore,
  type NotificationCategory,
} from "@/lib/stores/productivityStore";

/** Id prefixes — also the reconcile keys. */
export const SRV_PREFIX = "srv:";
export const PARENT_PREFIX = "pn:";

const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  LESSON_REMINDER:       "academic",
  DISCIPLINE_CASE:       "administrative",
  CALENDAR_DEADLINE:     "academic",
  CALENDAR_UPDATED:      "academic",
  ATTENDANCE_REMINDER:   "attendance",
  ATTENDANCE_ABSENT:     "attendance",
  RESULTS_RELEASED:      "examination",
  EXAM_ANALYSIS_ADMIN:   "examination",
  EXAM_ANALYSIS_TEACHER: "examination",
  FEES_PAYMENT:          "administrative",
  FINANCE_TRANSACTION:   "administrative",
  DIARY_POSTED:          "communication",
  PRINCIPAL_ALERT:       "administrative",
};

/** ParentNotification.module → the bell's category vocabulary. */
const MODULE_TO_CATEGORY: Record<string, NotificationCategory> = {
  DIARY:        "communication",
  ACADEMIC:     "academic",
  ATTENDANCE:   "attendance",
  FEES:         "administrative",
  BEHAVIOUR:    "administrative",
  ACHIEVEMENTS: "academic",
  CALENDAR:     "academic",
};

/** Where a parent notification should take you when tapped. */
const MODULE_TO_HREF: Record<string, string> = {
  DIARY:        "/parent/diary",
  ACADEMIC:     "/parent/results",
  ATTENDANCE:   "/parent/attendance",
  FEES:         "/parent/fees",
  BEHAVIOUR:    "/parent/behaviour",
  ACHIEVEMENTS: "/parent/achievements",
  CALENDAR:     "/parent/calendar",
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

interface ParentNotificationRow {
  id: string;
  module: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

const POLL_MS = 30_000;

interface Props {
  /**
   * Stable per-user string (the signed-in email). Namespaces the persisted
   * notification list so a shared machine never shows one user another's
   * notifications.
   */
  userScope?: string;
  /** Also pull the parent portal inbox. Set by the parent shell. */
  includeParent?: boolean;
}

export default function ServerNotificationSync({ userScope, includeParent }: Props) {
  // Applied before the first poll so nothing is written under the wrong key.
  useEffect(() => {
    if (userScope) useProductivityStore.getState().setUserScope(userScope);
  }, [userScope]);

  useEffect(() => {
    let cancelled = false;

    async function pollStaffInbox() {
      try {
        const res = await fetch("/api/notifications?limit=50", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        let rows: ServerNotification[] = await res.json();

        // Discipline cases surface in the parent's Messages tab (tagged with
        // a Discipline badge), not the bell — see /parent/messages.
        if (includeParent) rows = rows.filter((n) => n.type !== "DISCIPLINE_CASE");

        useProductivityStore.getState().hydrateNotifications(
          rows.map((n) => ({
            id:        `${SRV_PREFIX}${n.id}`,
            category:  TYPE_TO_CATEGORY[n.type] ?? "administrative",
            title:     n.title,
            body:      n.body,
            timestamp: new Date(n.createdAt).getTime(),
            read:      n.isRead,
            href:      n.href ?? undefined,
          })),
          SRV_PREFIX
        );
      } catch {
        // Offline or transient failure — next poll will retry.
      }
    }

    async function pollParentInbox() {
      if (!includeParent) return;
      try {
        const res = await fetch("/api/parent/notifications?page=1", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: { notifications?: ParentNotificationRow[] } = await res.json();
        if (!Array.isArray(data.notifications)) return;

        // Discipline/behaviour notifications surface in the Messages tab
        // (tagged with a Discipline badge) instead of the bell.
        const notifications = data.notifications.filter((n) => n.module !== "BEHAVIOUR");

        useProductivityStore.getState().hydrateNotifications(
          notifications.map((n) => ({
            id:        `${PARENT_PREFIX}${n.id}`,
            category:  MODULE_TO_CATEGORY[n.module] ?? "administrative",
            title:     n.title,
            body:      n.body,
            timestamp: new Date(n.createdAt).getTime(),
            read:      n.isRead,
            href:      MODULE_TO_HREF[n.module] ?? "/parent/notifications",
          })),
          PARENT_PREFIX
        );
      } catch {
        // Offline or transient failure — next poll will retry.
      }
    }

    function poll() {
      void pollStaffInbox();
      void pollParentInbox();
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [includeParent]);

  return null;
}
