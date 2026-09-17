import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { kenyaDayOfWeek, kenyaMinutesOfDay, kenyaDateKey } from "@/lib/notifications/schoolTime";

/**
 * Notifies every teacher shortly before each lesson on their timetable, for
 * "today" in the school's own local time. Run by a frequent cron tick, see
 * /api/notifications/tick.
 *
 * The lead time is evaluated against each school's own timetable template
 * (TimetableTemplateColumn.startTime), not a single global clock, since
 * different schools can run different day structures.
 *
 * ── Why the window is open-ended rather than a narrow band ──────────────────
 *
 * This rule used to fire only when a lesson was exactly 9–10 minutes away. A
 * band narrower than the cron interval fails *deterministically*, not
 * occasionally: on a five-minute cron, a period starting at 08:00 was always
 * caught and one starting at 08:02 was never caught, not once, because the
 * tick grid and the start time were permanently out of phase. Widening the
 * band to match the interval fixed that, but only for one specific interval —
 * it silently broke again the moment the schedule changed or a tick slipped.
 *
 * So the condition is no longer "is the lesson ~10 minutes away". It is:
 *
 *     the reminder is DUE  (lesson starts within LEAD_MINUTES), and
 *     the lesson has NOT STARTED yet, and
 *     this teacher has not already been told (the dedupKey)
 *
 * That makes every tick inside the whole lead-up period a valid delivery
 * opportunity instead of a single chance. Missing ticks no longer lose a
 * reminder — the next tick picks it up, right up until the lesson begins. The
 * window width is now completely decoupled from the cron interval, so changing
 * the schedule can never reintroduce the phase bug.
 *
 * The one thing this cannot fix is the tick not running at all: if nothing
 * executes between "10 minutes before" and the lesson start, the reminder is
 * genuinely too late to be useful and is dropped rather than sent as noise
 * after the fact. Keeping the tick alive is a deployment concern, not a logic
 * one — see the delivery accounting in the return value, which is there so a
 * dead or failing tick is visible rather than silent.
 */

/** How far ahead of a lesson a reminder becomes due, in minutes. */
const LEAD_MINUTES = 10;

export interface LessonReminderResult {
  /** Reminders newly delivered on this tick. */
  sent: number;
  /** Already delivered on an earlier tick — the normal steady state. */
  alreadySent: number;
  /** Writes that failed outright. Non-zero means notifications are being lost. */
  failed: number;
  /**
   * Lessons that were due but could not be addressed. These are silent
   * data-quality problems, surfaced here so they can be fixed rather than
   * quietly costing a teacher every reminder they should ever have had.
   */
  skipped: {
    /** Slot's period has no LESSON column with a start time in the template. */
    noStartTime: number;
    /** Teacher record is not linked to a user account, so has no inbox. */
    teacherHasNoUserAccount: number;
  };
}

export async function runLessonReminderTick(
  now: Date = new Date()
): Promise<LessonReminderResult> {
  const result: LessonReminderResult = {
    sent: 0,
    alreadySent: 0,
    failed: 0,
    skipped: { noStartTime: 0, teacherHasNoUserAccount: 0 },
  };

  const dayOfWeek  = kenyaDayOfWeek(now);
  const nowMinutes = kenyaMinutesOfDay(now);
  const dateKey    = kenyaDateKey(now);

  // ── 1. Work out which periods are due FIRST, from the template table. ─────
  // Ordering matters for survival, not just speed. This previously loaded
  // every timetable slot for the weekday across every school in the database
  // before filtering any of them by time. That grows with tenant count, and a
  // tick that exceeds the function timeout delivers nothing at all — a timeout
  // is itself a way for every teacher to miss every reminder. The template
  // table is small (one row per period per school), so resolving the due
  // periods here lets the slot query below be narrowed to just those.
  const columns = await prisma.timetableTemplateColumn.findMany({
    where:  { slotType: "LESSON" },
    select: { configId: true, position: true, startTime: true },
  });

  // TimetableConfig's primary key IS the school id, and configId is a FK to
  // it, so configId and schoolId are the same value.
  const dueByConfigPos = new Map<string, { startTime: string; minutesUntil: number }>();
  const dueSchoolIds = new Set<string>();
  const duePositions = new Set<number>();

  for (const column of columns) {
    const [h, m] = column.startTime.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;

    const minutesUntil = h * 60 + m - nowMinutes;
    // Due, and not yet started. `>= 1` rather than `>= 0` so a reminder is
    // never delivered in the same minute the lesson begins.
    if (minutesUntil < 1 || minutesUntil > LEAD_MINUTES) continue;

    dueByConfigPos.set(`${column.configId}:${column.position}`, {
      startTime: column.startTime,
      minutesUntil,
    });
    dueSchoolIds.add(column.configId);
    duePositions.add(column.position);
  }

  if (dueByConfigPos.size === 0) return result;

  // ── 2. Only now load slots, scoped to the schools and periods in play. ────
  const slots = await prisma.timetableSlot.findMany({
    where: {
      dayOfWeek,
      schoolId: { in: [...dueSchoolIds] },
      period:   { in: [...duePositions] },
    },
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
  if (slots.length === 0) return result;

  // Pooled/merged elective subjects are labelled distinctly. Scoped to the
  // subjects actually being reminded about, rather than the whole table.
  const groupSubjectIds = new Set(
    (
      await prisma.electiveGroupMember.findMany({
        where:  { subjectId: { in: [...new Set(slots.map((s) => s.subjectId))] } },
        select: { subjectId: true },
      })
    ).map((m) => m.subjectId)
  );

  // ── 3. Deliver. ───────────────────────────────────────────────────────────
  for (const slot of slots) {
    const due = dueByConfigPos.get(`${slot.schoolId}:${slot.period}`);
    if (!due) {
      // The slot's period is not a due LESSON column for its school. Only
      // reachable when a school reuses a position number for a non-lesson
      // slot type, so it is expected rather than a fault.
      continue;
    }

    if (!slot.teacher.userId) {
      result.skipped.teacherHasNoUserAccount++;
      continue;
    }

    const isGroup = groupSubjectIds.has(slot.subjectId);
    const label   = isGroup ? "Group Lesson" : slot.subject.name;

    // The dedupKey is what makes an open-ended window safe: every tick in the
    // lead-up retries, and exactly one of them results in a notification.
    const outcome = await notifyUser({
      schoolId: slot.schoolId,
      userId:   slot.teacher.userId,
      type:     "LESSON_REMINDER",
      title:    "Lesson starting soon",
      // The real lead time, not a hardcoded "10 minutes" — which tick catches
      // a lesson varies, so a fixed number would usually be wrong.
      body:     `${label} — ${slot.schoolClass.name} in ${due.minutesUntil} minutes (${due.startTime}).`,
      href:     "/teacher/timetable",
      dedupKey: `lesson:${slot.id}:${dateKey}`,
      metadata: {
        slotId:       slot.id,
        subject:      slot.subject.name,
        class:        slot.schoolClass.name,
        isGroup,
        startTime:    due.startTime,
        minutesUntil: due.minutesUntil,
      },
    });

    if (outcome === "sent")             result.sent++;
    else if (outcome === "duplicate")   result.alreadySent++;
    else                                result.failed++;
  }

  // Count slots whose period had no start time at all. Done as a second pass
  // over the same due set so the number reflects real timetable gaps rather
  // than periods that simply are not due yet.
  const missingStartTimes = await prisma.timetableSlot.count({
    where: {
      dayOfWeek,
      schoolId: { in: [...dueSchoolIds] },
      period:   { notIn: columns.map((c) => c.position) },
    },
  });
  result.skipped.noStartTime = missingStartTimes;

  if (result.failed > 0 || result.skipped.teacherHasNoUserAccount > 0) {
    console.warn("[lessonReminder] reminders not delivered", {
      failed: result.failed,
      skipped: result.skipped,
    });
  }

  return result;
}
