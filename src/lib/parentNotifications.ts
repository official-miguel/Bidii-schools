import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { NotificationPriority } from "@prisma/client";
import type { ParentWithStudents } from "./parentAuth";
import { sendPushToUsers } from "./push";
import { PARENT_MODULE_HREF } from "./parentNotificationLinks";

export interface NotifyParentsParams {
  schoolId: string;
  studentId: string;
  module: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  dedupKey?: string;
  metadata?: Record<string, unknown>;
}

type ParentRecipient = { id: string; userId: string };

/**
 * Writes one ParentNotification per recipient and pushes to the devices of
 * every parent who got a NEW row. Re-delivery of an already-recorded event
 * (same dedupKey) never re-pushes.
 *
 * ParentNotification is unique on [schoolId, dedupKey], so the stored key is
 * suffixed with the parent id — one shared key would let only the first of a
 * child's parents ever be notified.
 */
async function deliverToParents(
  recipients: ParentRecipient[],
  params: Omit<NotifyParentsParams, "studentId">,
  onDuplicate: "refresh" | "keep",
  /** Parent ids that already hold a row under a pre-suffix (legacy) key. */
  alreadyNotified: ReadonlySet<string> = new Set()
): Promise<void> {
  const { schoolId, module, priority, title, body, dedupKey, metadata } = params;
  // Prisma requires Prisma.JsonNull (not plain null) for nullable JSON fields
  const jsonMetadata = metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull;

  const created = await Promise.all(
    recipients.map(async (parent): Promise<string | null> => {
      if (alreadyNotified.has(parent.id)) return null;
      const key = dedupKey ? `${dedupKey}:${parent.id}` : null;
      try {
        await prisma.parentNotification.create({
          data: { schoolId, parentId: parent.id, module, priority, title, body, metadata: jsonMetadata, dedupKey: key },
        });
        return parent.userId;
      } catch (err) {
        // P2002 = this event already notified this parent — idempotent.
        if ((err as { code?: string }).code === "P2002" && key) {
          if (onDuplicate === "refresh") {
            await prisma.parentNotification.update({
              where: { schoolId_dedupKey: { schoolId, dedupKey: key } },
              data: { title, body, priority, metadata: jsonMetadata },
            }).catch(() => {});
          }
        } else {
          // One parent's failure must not cost the others their notification.
          console.error("[notifyParents] write failed for parent", parent.id, err);
        }
        return null;
      }
    })
  );

  const userIds = created.filter((id): id is string => id !== null);
  await sendPushToUsers(userIds, {
    title,
    body,
    href: PARENT_MODULE_HREF[module] ?? "/parent/notifications",
    tag: dedupKey,
  });
}

/**
 * Notifies every parent linked to the given student: an in-app
 * ParentNotification plus a push to their installed app / browser.
 *
 * - With a dedupKey the call is idempotent per parent: repeating the event
 *   refreshes the existing row's text and does not push again.
 * - Without one, every call creates a fresh row.
 * - Never throws — a notification failure must not roll back the caller's
 *   operation. Callers in request handlers should hand the promise to
 *   waitUntil() rather than `void` it, or serverless may freeze before the
 *   push is sent.
 */
export async function notifyParents(params: NotifyParentsParams): Promise<void> {
  const { schoolId, studentId, dedupKey, ...rest } = params;

  try {
    const links = await prisma.parentStudent.findMany({
      where: { studentId },
      select: { parent: { select: { id: true, userId: true } } },
    });
    if (links.length === 0) return;

    // Rows written before keys were suffixed per parent used the bare key.
    // Whoever holds one was already notified about this event.
    const legacy = dedupKey
      ? await prisma.parentNotification.findMany({
          where: { schoolId, dedupKey },
          select: { parentId: true },
        })
      : [];

    await deliverToParents(
      links.map((l) => l.parent),
      { schoolId, dedupKey, ...rest },
      "refresh",
      new Set(legacy.map((r) => r.parentId))
    );
  } catch (err) {
    console.error("[notifyParents] Failed to notify parents:", err);
  }
}

export type NotifyAllParentsParams = Omit<NotifyParentsParams, "studentId">;

/**
 * Notifies EVERY parent in the school — for things that are not about one
 * child, such as a calendar announcement addressed to parents.
 *
 * Like notifyParents, this never throws: a notification failure must not roll
 * back the caller's primary operation.
 */
export async function notifyAllParents(params: NotifyAllParentsParams): Promise<number> {
  try {
    const parents = await prisma.parent.findMany({
      where: { schoolId: params.schoolId },
      select: { id: true, userId: true },
    });
    if (parents.length === 0) return 0;

    await deliverToParents(parents, params, "keep");
    return parents.length;
  } catch (err) {
    console.error("[notifyAllParents] Failed to notify parents:", err);
    return 0;
  }
}

/**
 * Checks whether the student's attendance in the last 30 days crosses the 20%
 * absence threshold. If it does, writes a HIGH-priority ATTENDANCE notification
 * for every parent linked to the student (deduped per calendar month so the
 * alert fires at most once per month per student).
 *
 * Call this server-side on every render of the attendance page — the dedupKey
 * prevents duplicate rows from accumulating.
 *
 * Requirements: 6.4
 */
export async function checkAttendanceAlert(
  parent: ParentWithStudents,
  studentId: string,
  records: { date: Date | string; status: string }[]
): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Filter to last 30 days
  const last30 = records.filter((r) => new Date(r.date) >= thirtyDaysAgo);

  if (last30.length === 0) return;

  const absentCount = last30.filter((r) => r.status === "ABSENT").length;

  if (absentCount / last30.length > 0.2) {
    // Compute YYYY-MM for dedup key (fires at most once per calendar month per student)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    await notifyParents({
      schoolId:  parent.schoolId,
      studentId,
      module:    "ATTENDANCE",
      priority:  "HIGH",
      title:     "Attendance Concern",
      body:      `Your child has been absent ${absentCount} out of the last ${last30.length} school days (${Math.round((absentCount / last30.length) * 100)}%). Please contact the school if there are ongoing concerns.`,
      dedupKey:  `attendance-alert-${studentId}-${currentMonth}`,
    });
  }
}
