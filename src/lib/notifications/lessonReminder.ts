import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";

/**
 * Notifies every teacher 10 minutes before each lesson on their timetable,
 * for "today" in the school's own local time. Run by a frequent cron tick
 * (see /api/notifications/tick) — safe to call repeatedly in the same
 * minute because each lesson gets a stable dedupKey per teacher/day.
 *
 * "10 minutes before" is evaluated against each school's own timetable
 * template (TimetableTemplateColumn.startTime), not a single global clock,
 * since different schools can run different day structures.
 */
export async function runLessonReminderTick(now: Date = new Date()): Promise<number> {
  let sent = 0;

  // Kenya schools currently — timetable start times are stored as local
  // "HH:MM" strings with no timezone, so we compare against local wall time.
  const dayOfWeek = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const dateKey = now.toISOString().slice(0, 10);

  const slots = await prisma.timetableSlot.findMany({
    where: { dayOfWeek },
    select: {
      id: true,
      period: true,
      schoolId: true,
      teacherId: true,
      subjectId: true,
      teacher: { select: { userId: true } },
      subject: { select: { id: true, name: true } },
      schoolClass: { select: { name: true } },
    },
  });
  if (slots.length === 0) return 0;

  const schoolIds = [...new Set(slots.map((s) => s.schoolId))];
  const columns = await prisma.timetableTemplateColumn.findMany({
    where: { configId: { in: schoolIds }, slotType: "LESSON" },
    select: { configId: true, position: true, startTime: true },
  });
  const startTimeByConfigPos = new Map<string, string>();
  for (const c of columns) startTimeByConfigPos.set(`${c.configId}:${c.position}`, c.startTime);

  // Group subjects taught as a pooled/merged elective — labelled distinctly.
  const groupSubjectIds = new Set(
    (await prisma.electiveGroupMember.findMany({ select: { subjectId: true } })).map(
      (m) => m.subjectId
    )
  );

  for (const slot of slots) {
    const startTime = startTimeByConfigPos.get(`${slot.schoolId}:${slot.period}`);
    if (!startTime) continue;

    const [h, m] = startTime.split(":").map(Number);
    const startMinutes = h * 60 + m;
    const minutesUntil = startMinutes - nowMinutes;

    // Fire once, in the [9, 10] minute window before the lesson — the tick
    // runs every few minutes, so a single "exactly 10" check could miss it.
    if (minutesUntil < 9 || minutesUntil > 10) continue;
    if (!slot.teacher.userId) continue;

    const isGroup = groupSubjectIds.has(slot.subjectId);
    const label = isGroup ? "Group Lesson" : slot.subject.name;

    await notifyUser({
      schoolId: slot.schoolId,
      userId: slot.teacher.userId,
      type: "LESSON_REMINDER",
      title: "Lesson starting soon",
      body: `${label} — ${slot.schoolClass.name} in 10 minutes.`,
      href: "/teacher/timetable",
      dedupKey: `lesson:${slot.id}:${dateKey}`,
      metadata: { slotId: slot.id, subject: slot.subject.name, class: slot.schoolClass.name, isGroup },
    });
    sent++;
  }

  return sent;
}
