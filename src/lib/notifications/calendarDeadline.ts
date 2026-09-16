import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications";

/**
 * Notifies everyone in a calendar event's audience one day before its
 * closing date (the "deadline"). Runs on a coarse daily-ish window so it
 * doesn't matter exactly how often the tick fires — the dedupKey keys off
 * the event + day, so it only ever sends once per event.
 */
export async function runCalendarDeadlineTick(now: Date = new Date()): Promise<number> {
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const events = await prisma.calendarEvent.findMany({
    where: { closingDate: { gte: windowStart, lte: windowEnd } },
    select: { id: true, schoolId: true, title: true, closingDate: true, audience: true },
  });
  if (events.length === 0) return 0;

  let sent = 0;
  for (const event of events) {
    const staffRoles = ["TEACHER", "ADMIN_STAFF", "BURSAR", "PRINCIPAL"] as const;
    const wantsStaff  = event.audience === "EVERYONE" || event.audience === "STAFF_ONLY";
    const wantsParent = event.audience === "EVERYONE" || event.audience === "PARENTS_ONLY";

    const recipients = await prisma.user.findMany({
      where: {
        schoolId: event.schoolId,
        isActive: true,
        OR: [
          ...(wantsStaff  ? [{ role: { in: [...staffRoles] } }] : []),
          ...(wantsParent ? [{ role: "PARENT" as const }] : []),
        ],
      },
      select: { id: true },
    });
    if (recipients.length === 0) continue;

    await notifyUsers(
      recipients.map((r) => r.id),
      {
        schoolId: event.schoolId,
        type: "CALENDAR_DEADLINE",
        title: "Deadline tomorrow",
        body: `"${event.title}" is due tomorrow.`,
        dedupKey: `calendar-deadline:${event.id}`,
      }
    );
    sent += recipients.length;
  }

  return sent;
}
