/**
 * Parent-facing calendar notifications.
 *
 * Three reminders per event, which is what the school asked for:
 *   1. when the event is added   — fired inline by POST /api/calendar/events
 *   2. the day before            — fired here, by the notifications cron
 *   3. at 7am on the day itself  — fired here, by the notifications cron
 *
 * "Concerns them" is decided by the event's audience: PARENTS_ONLY events are
 * addressed to parents, and EVERYONE events concern the whole school, parents
 * included. STAFF_ONLY events are never sent to parents.
 *
 * CalendarEvent has no per-class or per-student link, so a parent-facing event
 * reaches every parent in the school. If events ever need to target individual
 * classes, that is a schema change (a CalendarEvent → SchoolClass join) plus a
 * calendar-editor change; only the recipient query here would need updating.
 */

import type { CalendarAudience, EventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyAllParents } from "@/lib/parentNotifications";
import { kenyaHour, kenyaDateKey, formatKenyaDate } from "@/lib/notifications/schoolTime";

// Re-exported for the callers that reach for these alongside the calendar
// helpers (the calendar POST route formats an event date in its copy).
export { formatKenyaDate };

/** True when an event's audience includes parents. */
export function parentFacingAudience(audience: CalendarAudience): boolean {
  return audience === "PARENTS_ONLY" || audience === "EVERYONE";
}

/** Prefix the title so a calendar item reads as an announcement in the feed. */
export function announcementTitle(type: EventType, title: string): string {
  switch (type) {
    case "EXAM":    return `Exam: ${title}`;
    case "MEETING": return `Meeting: ${title}`;
    case "HOLIDAY": return `Holiday: ${title}`;
    default:        return title;
  }
}

/**
 * Daily 7am (Kenya) reminder pass for parent-facing calendar events: one for
 * events happening tomorrow, one for events happening today.
 *
 * The tick runs every few minutes, so this is gated to the 07:00–07:59 Kenyan
 * hour and further protected by per-event dedup keys — re-running inside that
 * hour, or after a retry, sends nothing twice.
 */
export async function runParentEventReminderTick(now: Date = new Date()): Promise<number> {
  if (kenyaHour(now) !== 7) return 0;

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return (
    (await remindForDay(kenyaDateKey(now), "today")) +
    (await remindForDay(kenyaDateKey(tomorrow), "tomorrow"))
  );
}

async function remindForDay(dateKey: string, when: "today" | "tomorrow"): Promise<number> {
  // The stored `date` is a midnight-UTC day marker, so the Kenyan calendar day
  // maps to the [00:00, 24:00) UTC range for that same date string.
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd   = new Date(`${dateKey}T23:59:59.999Z`);

  const events = await prisma.calendarEvent.findMany({
    where: {
      date:     { gte: dayStart, lte: dayEnd },
      audience: { in: ["PARENTS_ONLY", "EVERYONE"] },
    },
    select: { id: true, schoolId: true, title: true, description: true, type: true, date: true },
  });

  let sent = 0;
  for (const event of events) {
    sent += await notifyAllParents({
      schoolId: event.schoolId,
      module:   "CALENDAR",
      priority: when === "today" ? "HIGH" : "NORMAL",
      title:
        when === "today"
          ? `Today: ${announcementTitle(event.type, event.title)}`
          : `Tomorrow: ${announcementTitle(event.type, event.title)}`,
      body:
        (event.description?.trim() ? `${event.description.trim()} ` : "") +
        (when === "today"
          ? `This is happening today (${formatKenyaDate(event.date)}).`
          : `This is happening tomorrow, ${formatKenyaDate(event.date)}.`),
      // Keyed on the event AND the calendar day, so a recurring-looking event
      // moved to a new date legitimately reminds again for its new day.
      dedupKey: `cal-${when}:${event.id}:${dateKey}`,
      metadata: { eventId: event.id, date: event.date.toISOString(), type: event.type, when },
    });
  }

  return sent;
}
