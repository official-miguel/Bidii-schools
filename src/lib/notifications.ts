import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

/**
 * Every trigger rule in the app tags its notifications with one of these, so
 * the notification center can group/icon by type without a schema change
 * per feature. Keep this list in sync with whatever rules actually fire.
 */
export type NotificationType =
  | "LESSON_REMINDER"
  | "DISCIPLINE_CASE"
  | "CALENDAR_DEADLINE"
  | "CALENDAR_UPDATED"
  | "ATTENDANCE_REMINDER"
  | "ATTENDANCE_ABSENT"
  | "RESULTS_RELEASED"
  /// Exam period fully marked — the class/subject failure hotspots, for the
  /// principal and anyone with full ASSESSMENTS management rights.
  | "EXAM_ANALYSIS_ADMIN"
  /// Exam period fully marked — a subject teacher's own below-average learners.
  | "EXAM_ANALYSIS_TEACHER"
  | "FEES_PAYMENT"
  | "FINANCE_TRANSACTION"
  | "DIARY_POSTED"
  | "PRINCIPAL_ALERT";

export interface NotifyInput {
  schoolId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  metadata?: Record<string, unknown>;
  /**
   * Uniquely identifies the event for this user, e.g.
   * `lesson:${slotId}:${dateISO}` or `discipline:${recordId}`. Passing the
   * same key twice for the same user is a no-op the second time — safe for
   * a cron tick to re-evaluate the same window without duplicating alerts.
   */
  dedupKey?: string;
}

/**
 * What became of a notifyUser call.
 *   "sent"      — a new notification row was created for this user.
 *   "duplicate" — this exact event had already notified this user (dedupKey).
 *   "failed"    — the write did not happen. The notification is LOST.
 *
 * Returned rather than thrown so callers stay non-throwing by default, but can
 * count failures. Rules that must not silently lose deliveries (the lesson
 * reminder) tally these so a broken inbox is visible in the cron response
 * instead of only in a log line nobody reads.
 */
export type NotifyOutcome = "sent" | "duplicate" | "failed";

/**
 * Creates the in-app notification row and best-effort fires a Web Push to
 * every device the user has subscribed on. Never throws — a notification
 * failure should not roll back the business action that triggered it.
 */
export async function notifyUser(input: NotifyInput): Promise<NotifyOutcome> {
  try {
    await prisma.notification.create({
      data: {
        schoolId: input.schoolId,
        userId:   input.userId,
        type:     input.type,
        title:    input.title,
        body:     input.body,
        href:     input.href,
        metadata: input.metadata as never,
        dedupKey: input.dedupKey,
      },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    // P2002 = unique constraint hit on [userId, dedupKey] — this exact event
    // already notified this user once. Nothing more to do.
    if (code === "P2002") return "duplicate";
    console.error("[notifications] notifyUser failed", input.type, err);
    return "failed";
  }

  await sendPushToUser(input.userId, {
    title: input.title,
    body:  input.body,
    href:  input.href,
    tag:   input.dedupKey,
  });

  return "sent";
}

/** Fan-out helper for notifying several users with the same content. */
export async function notifyUsers(
  userIds: string[],
  input: Omit<NotifyInput, "userId">
): Promise<void> {
  await Promise.all(userIds.map((userId) => notifyUser({ ...input, userId })));
}
