/// Section: School Calendar dashboard widgets. Both the Principal and
/// Teacher dashboards show a short "today + upcoming" list — this is the one
/// place that merges real CalendarEvent rows with computed Kenya public
/// holidays (src/lib/kenyaHolidays.ts) for that list, so the two dashboard
/// widgets (and the full calendar page) never drift out of sync on how
/// merging works.

import { prisma } from "./prisma";
import { getKenyaPublicHolidays } from "./kenyaHolidays";

// ─────────────────────────────────────────────────────────────────────────────
// Principal deadlines
// ─────────────────────────────────────────────────────────────────────────────

export type PrincipalDeadline = {
  id:          string;
  title:       string;
  description: string | null;
  deadlineAt:  Date;   // maps to CalendarEvent.closingDate
  eventDate:   Date;   // maps to CalendarEvent.date (the event itself)
  audience:    string;
};

/**
 * Returns all school-set deadlines (CalendarEvents where closingDate is today
 * or in the future) that are visible to teachers (audience EVERYONE or
 * STAFF_ONLY). Sorted by deadline ascending — soonest first.
 *
 * A deadline is any calendar event the principal has given a closing date.
 * The pattern mirrors how AssessmentPeriod.closingDate is surfaced: the
 * closingDate IS the deadline; the event.date is when the event starts.
 */
export async function getPrincipalDeadlines(
  schoolId: string
): Promise<PrincipalDeadline[]> {
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const events = await prisma.calendarEvent.findMany({
    where: {
      schoolId,
      closingDate: { gte: todayUtc },
      audience:    { in: ["EVERYONE", "STAFF_ONLY"] },
    },
    orderBy: { closingDate: "asc" },
    select: {
      id:          true,
      title:       true,
      description: true,
      closingDate: true,
      date:        true,
      audience:    true,
    },
  });

  return events.map((e) => ({
    id:          e.id,
    title:       e.title,
    description: e.description,
    // closingDate is non-null here because the where clause filters for it
    deadlineAt:  e.closingDate!,
    eventDate:   e.date,
    audience:    e.audience,
  }));
}

export type UpcomingCalendarItem = {
  id: string;
  title: string;
  date: Date;
  type: string;
  isHoliday: boolean;
};

/// Returns up to `limit` items dated today or later, within the next `days`
/// days, soonest first.
export async function getUpcomingCalendarItems(
  schoolId: string,
  { days = 14, limit = 5 }: { days?: number; limit?: number } = {}
): Promise<UpcomingCalendarItem[]> {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rangeEnd = new Date(todayUtc.getTime() + days * 24 * 60 * 60 * 1000);

  const dbEvents = await prisma.calendarEvent.findMany({
    where: { schoolId, date: { gte: todayUtc, lt: rangeEnd } },
    orderBy: { date: "asc" },
  });

  // Kenya holidays are computed per calendar year, so a range spanning a
  // year boundary (e.g. looking 14 days ahead from December 28) needs both
  // years' holiday sets.
  const years = new Set([todayUtc.getUTCFullYear(), rangeEnd.getUTCFullYear()]);
  const holidays = Array.from(years)
    .flatMap((y) => getKenyaPublicHolidays(y))
    .filter((h) => h.date >= todayUtc && h.date < rangeEnd);

  const merged: UpcomingCalendarItem[] = [
    ...dbEvents.map((e) => ({ id: e.id, title: e.title, date: e.date, type: e.type as string, isHoliday: false })),
    ...holidays.map((h) => ({ id: h.id, title: h.title, date: h.date, type: "HOLIDAY", isHoliday: true })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return merged.slice(0, limit);
}
