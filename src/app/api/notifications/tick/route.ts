/**
 * GET /api/notifications/tick — frequent cron: time-based notification rules.
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}, same pattern as the
 * other jobs in this codebase (see /api/finance/jobs/debtor-refresh).
 *
 * Runs the rules that can't be triggered from a single write path because
 * they depend on the clock, not an event:
 *   - lesson reminder      (10 min before each lesson, per teacher)
 *   - attendance reminder  (midday nudge for an unmarked class register)
 *   - calendar deadline    (1 day before a calendar event's closing date)
 *
 * NOTE: Vercel's Hobby plan only allows daily cron invocations. This route
 * needs to run every few minutes to catch the 10-minutes-before-lesson
 * window, so on Hobby it must be triggered by an external scheduler (e.g.
 * cron-job.org, GitHub Actions) hitting this URL every 5 minutes with the
 * same Bearer token, instead of (or in addition to) vercel.json's cron.
 */
import { NextRequest, NextResponse } from "next/server";
import { runLessonReminderTick } from "@/lib/notifications/lessonReminder";
import { runAttendanceReminderTick } from "@/lib/notifications/attendanceReminder";
import { runCalendarDeadlineTick } from "@/lib/notifications/calendarDeadline";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const now = new Date();
    const [lessons, attendance, deadlines] = await Promise.all([
      runLessonReminderTick(now),
      runAttendanceReminderTick(now),
      runCalendarDeadlineTick(now),
    ]);
    return NextResponse.json({ lessons, attendance, deadlines });
  } catch (err) {
    console.error("[CRON/NOTIFICATIONS-TICK]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
