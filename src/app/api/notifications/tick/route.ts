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
 *   - parent event reminder (7am Kenyan, for parent-facing calendar events
 *                            happening today and tomorrow)
 *   - parent fees reminder  (7am Kenyan, once a term passes its midpoint, to
 *                            parents of students with an outstanding balance)
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
import { runParentEventReminderTick } from "@/lib/notifications/parentCalendar";
import { runParentFeesReminderTick } from "@/lib/notifications/parentFeesReminder";
import { recordTickHeartbeat } from "@/lib/notifications/heartbeat";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();

  // Each rule is isolated. Under the previous Promise.all, one rule throwing
  // rejected the whole tick — a bug in the fees reminder would take down every
  // teacher's lesson reminder with it, and the 500 meant even the rules that
  // HAD succeeded went unreported. Independent failures must stay independent.
  const [lessons, attendance, deadlines, parentEvents, parentFees] = await Promise.all([
    runRule("lessons",      () => runLessonReminderTick(now)),
    runRule("attendance",   () => runAttendanceReminderTick(now)),
    runRule("deadlines",    () => runCalendarDeadlineTick(now)),
    runRule("parentEvents", () => runParentEventReminderTick(now)),
    runRule("parentFees",   () => runParentFeesReminderTick(now)),
  ]);

  // Stamped after the rules, and outside runRule, so it records that the tick
  // actually completed — and so it still runs when every rule has failed,
  // which is exactly when the record matters most.
  const heartbeat = await recordTickHeartbeat(now);

  const results = { lessons, attendance, deadlines, parentEvents, parentFees };
  const failedRules = Object.entries(results)
    .filter(([, r]) => r.error !== undefined)
    .map(([name]) => name);

  // 500 only when EVERY rule failed, which is the signal that the tick itself
  // is broken (DB unreachable, bad deploy) rather than one rule misbehaving.
  // A partial failure still returns 200 so the scheduler does not treat a
  // working tick as down, but names the failures in the body and the logs.
  const status = failedRules.length === Object.keys(results).length ? 500 : 200;

  if (failedRules.length > 0) {
    console.error("[CRON/NOTIFICATIONS-TICK] rules failed", failedRules, results);
  }

  return NextResponse.json(
    { ranAt: now.toISOString(), heartbeat, failedRules, ...results },
    { status }
  );
}

/**
 * Runs one rule, converting a throw into a reported error rather than letting
 * it reject the tick. The rule's own result is returned untouched on success.
 */
async function runRule<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ result?: T; error?: string }> {
  try {
    return { result: await fn() };
  } catch (err) {
    console.error(`[CRON/NOTIFICATIONS-TICK] ${name} failed`, err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
