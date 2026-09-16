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
 * Creates the in-app notification row and best-effort fires a Web Push to
 * every device the user has subscribed on. Never throws — a notification
 * failure should not roll back the business action that triggered it.
 */
export async function notifyUser(input: NotifyInput): Promise<void> {
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
    if (code === "P2002") return;
    console.error("[notifications] notifyUser failed", input.type, err);
    return;
  }

  await sendPushToUser(input.userId, {
    title: input.title,
    body:  input.body,
    href:  input.href,
    tag:   input.dedupKey,
  });
}

/** Fan-out helper for notifying several users with the same content. */
export async function notifyUsers(
  userIds: string[],
  input: Omit<NotifyInput, "userId">
): Promise<void> {
  await Promise.all(userIds.map((userId) => notifyUser({ ...input, userId })));
}
