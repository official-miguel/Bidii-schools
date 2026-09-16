import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";

/**
 * Midday nudge to every class teacher who hasn't marked attendance for their
 * own class yet today. Fires once per class per day (dedupKey), so it's safe
 * for the tick to check this every run through the afternoon — once sent,
 * it won't repeat even after the teacher finally marks attendance.
 */
export async function runAttendanceReminderTick(now: Date = new Date()): Promise<number> {
  const hour = now.getHours();
  if (hour < 12 || hour >= 14) return 0; // "midday" window, tick runs every few minutes

  const dateKey = now.toISOString().slice(0, 10);
  const startOfDay = new Date(dateKey + "T00:00:00.000Z");
  const endOfDay = new Date(dateKey + "T23:59:59.999Z");

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
