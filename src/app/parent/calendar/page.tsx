/**
 * /parent/calendar
 *
 * Server component that displays the school calendar to the authenticated
 * parent. Shows only events visible to parents (EVERYONE or PARENTS_ONLY).
 *
 * - UpcomingCalendarWidget shows the next 3 upcoming items from the
 *   combined school + Kenya public holidays stream.
 * - CalendarEventList shows all DB events (no holidays) ordered by date.
 *
 * Requirements: 11.1, 11.2, 11.4
 */

import { redirect } from "next/navigation";
import { requireParent } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import CalendarEventList, {
  type CalendarEventItem,
} from "@/components/parent/CalendarEventList";

export const dynamic = "force-dynamic";

export default async function ParentCalendarPage() {
  const parent = await requireParent();
  if (!parent) redirect("/parent-login");

  const schoolId = parent.schoolId;

  // All DB calendar events visible to parents, ordered by date asc
  const rawEvents = await prisma.calendarEvent.findMany({
    where: {
      schoolId,
      audience: { in: ["EVERYONE", "PARENTS_ONLY"] },
    },
    orderBy: { date: "asc" },
    select: {
      id:          true,
      title:       true,
      description: true,
      date:        true,
      type:        true,
    },
  });

  // Map to CalendarEventItem (dates serialised to ISO string for the client)
  const allEvents: CalendarEventItem[] = rawEvents.map((e) => ({
    id:          e.id,
    title:       e.title,
    description: e.description,
    date:        e.date.toISOString(),
    type:        e.type as string,
  }));

  // Upcoming widget — merges school events + Kenya public holidays
  const upcoming = await getUpcomingCalendarItems(schoolId, {
    days:  60,
    limit: 3,
  });

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">
          School Calendar
        </h1>
        <p className="text-sm text-slate dark:text-dark-muted mt-1">
          Upcoming events and important dates for your school.
        </p>
      </div>

      {/* Upcoming widget — next 3 events */}
      <UpcomingCalendarWidget items={upcoming} calendarHref="/parent/calendar" />

      {/* Full event list grouped by month */}
      <div>
        <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">
          All events
        </p>
        <CalendarEventList events={allEvents} />
      </div>
    </div>
  );
}
