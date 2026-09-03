import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { NotificationPriority } from "@prisma/client";
import type { ParentWithStudents } from "./parentAuth";

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

/**
 * Writes a ParentNotification row for every parent linked to the given student.
 *
 * - If dedupKey is provided, uses upsert on @@unique([schoolId, dedupKey])
 *   so duplicate events are idempotent (exactly one row per dedupKey per school).
 * - If dedupKey is omitted, always creates a new row.
 * - Wraps everything in try/catch: on error, logs to console and returns without
 *   throwing so the caller's primary operation is never affected.
 *
 * Usage (fire-and-forget outside primary transaction):
 *   void notifyParents({ ... }).catch(() => {});
 *   // or await it after the primary write completes:
 *   await notifyParents({ ... });
 */
export async function notifyParents(params: NotifyParentsParams): Promise<void> {
  const { schoolId, studentId, module, priority, title, body, dedupKey, metadata } = params;

  try {
    // Find all parents linked to this student
    const parentStudents = await prisma.parentStudent.findMany({
      where: { studentId },
      select: { parentId: true },
    });

    // Bail early — no linked parents, nothing to notify
    if (parentStudents.length === 0) return;

    // Prisma requires Prisma.JsonNull (not plain null) for nullable JSON fields
    const jsonMetadata = metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull;

    // Fan out a notification write per linked parent
    await Promise.all(
      parentStudents.map((ps) => {
        const data = {
          schoolId,
          parentId: ps.parentId,
          module,
          priority,
          title,
          body,
          metadata: jsonMetadata,
          dedupKey: dedupKey ?? null,
        };

        if (dedupKey) {
          // Upsert on @@unique([schoolId, dedupKey]) — idempotent for duplicate events
          return prisma.parentNotification.upsert({
            where: { schoolId_dedupKey: { schoolId, dedupKey } },
            create: data,
            update: { title, body, priority, metadata: jsonMetadata },
          });
        }

        // No dedupKey — always create a fresh row
        return prisma.parentNotification.create({ data });
      })
    );
  } catch (err) {
    // Non-throwing: notification failure must not roll back the caller's operation
    console.error("[notifyParents] Failed to write ParentNotification:", err);
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
