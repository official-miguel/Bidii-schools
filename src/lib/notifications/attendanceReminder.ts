import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { kenyaHour, kenyaDateKey, kenyaDayRangeUtc } from "@/lib/notifications/schoolTime";

/**
 * Midday nudge to every class teacher who hasn't marked attendance for their
 * own class yet today. Fires once per class per day (dedupKey), so it's safe
 * for the tick to check this every run through the afternoon — once sent,
 * it won't repeat even after the teacher finally marks attendance.
 *
 * "Midday" means midday IN KENYA. This used to read now.getHours(), which on a
 * UTC server made the window 15:00–17:00 Nairobi and delivered the reminder
 * about three hours late, after school had finished.
 */
export async function runAttendanceReminderTick(now: Date = new Date()): Promise<number> {
  const hour = kenyaHour(now);
  if (hour < 12 || hour >= 14) return 0; // "midday" window, tick runs every few minutes

  const dateKey = kenyaDateKey(now);
  // Attendance.date is a midnight-UTC marker for the local day the teacher
  // picked, so "today" is the Kenyan day's marker — not the UTC day's.
  const { start: startOfDay, end: endOfDay } = kenyaDayRangeUtc(now);

  const classes = await prisma.schoolClass.findMany({
    where: { classTeacherId: { not: null } },
    select: {
      id: true,
      name: true,
      schoolId: true,
      classTeacher: { select: { userId: true } },
    },
  });

  let sent = 0;
  for (const cls of classes) {
    if (!cls.classTeacher?.userId) continue;

    const marked = await prisma.attendance.findFirst({
      where: { classId: cls.id, date: { gte: startOfDay, lte: endOfDay } },
      select: { id: true },
    });
    if (marked) continue;

    await notifyUser({
      schoolId: cls.schoolId,
      userId: cls.classTeacher.userId,
      type: "ATTENDANCE_REMINDER",
      title: "Attendance not marked",
      body: `You haven't marked today's attendance for ${cls.name} yet.`,
      href: "/teacher/attendance",
      dedupKey: `attendance-reminder:${cls.id}:${dateKey}`,
    });
    sent++;
  }

  return sent;
}
