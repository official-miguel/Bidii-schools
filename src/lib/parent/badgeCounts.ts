/**
 * Shared nav-badge count helpers for the parent portal.
 *
 * These replace the hardcoded `badge: 2` / `badge: 3` literals that used to
 * live in ParentPortalShell — every number rendered in a nav badge must be
 * backed by a real query.
 *
 * SERVER-ONLY (imports Prisma).
 */

import { prisma } from "@/lib/prisma";

/**
 * Number of ASSIGNMENT/HOMEWORK diary entries due within the next 7 days,
 * across every child linked to this parent. Mirrors the per-child
 * "N due this week" pill computed on /parent/diary, but summed across
 * children since the nav badge has no active-child context.
 */
export async function getDiaryDueSoonCount(
  schoolId: string,
  studentIds: string[]
): Promise<number> {
  if (studentIds.length === 0) return 0;

  const students = await prisma.student.findMany({
    where:  { id: { in: studentIds } },
    select: { classId: true },
  });
  const classIds = [...new Set(students.map((s) => s.classId).filter((c): c is string => !!c))];
  if (classIds.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  in7Days.setHours(23, 59, 59, 999);

  return prisma.diaryEntry.count({
    where: {
      schoolId,
      deletedAt: null,
      entryType: { in: ["ASSIGNMENT", "HOMEWORK"] },
      dueDate:   { gte: today, lte: in7Days },
      targets:   { some: { classId: { in: classIds } } },
    },
  });
}

/**
 * Number of unread items in the parent's Messages tab: school broadcast
 * messages plus parent-visible discipline records created after the
 * parent's last visit to /parent/messages. `messagesLastReadAt` defaults to
 * the parent account's creation time, so history that predates the account
 * never counts as "unread".
 */
export async function getMessagesUnreadCount(
  schoolId: string,
  studentIds: string[],
  messagesLastReadAt: Date | null,
  parentCreatedAt: Date
): Promise<number> {
  const since = messagesLastReadAt ?? parentCreatedAt;

  const [messageCount, disciplineCount] = await Promise.all([
    prisma.message.count({
      where: { schoolId, createdAt: { gt: since } },
    }),
    studentIds.length === 0
      ? Promise.resolve(0)
      : prisma.disciplineRecord.count({
          where: {
            studentId:        { in: studentIds },
            isVisibleToParent: true,
            createdAt:         { gt: since },
          },
        }),
  ]);

  return messageCount + disciplineCount;
}
