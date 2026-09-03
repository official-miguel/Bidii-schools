import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Teacher authorization context
// ─────────────────────────────────────────────────────────────────────────────

export interface TeacherDiaryContext {
  teacher: { id: string };
  /** Set of "classId:subjectId" keys representing what this teacher is authorized to teach */
  authorizedSet: Set<string>;
  /** Distinct subjectIds the teacher is assigned to */
  subjectIds: string[];
}

/**
 * Builds the teacher's diary authorization context by querying both
 * ClassSubjectTeacher (core subjects) and ClassElectiveGroupTeacher (electives).
 *
 * Throws if no Teacher record is linked to the given userId.
 */
export async function getTeacherDiaryContext(
  userId: string,
  schoolId: string
): Promise<TeacherDiaryContext> {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!teacher) throw new Error("No teacher record found.");

  const [core, elective] = await Promise.all([
    prisma.classSubjectTeacher.findMany({
      where: { teacherId: teacher.id },
      select: {
        classId: true,
        subjectId: true,
      },
    }),
    prisma.classElectiveGroupTeacher.findMany({
      where: { teacherId: teacher.id, schoolId },
      select: {
        classId: true,
        subjectId: true,
      },
    }),
  ]);

  const authorizedSet = new Set([
    ...core.map((a) => `${a.classId}:${a.subjectId}`),
    ...elective.map((a) => `${a.classId}:${a.subjectId}`),
  ]);

  const subjectIds = [
    ...new Set([
      ...core.map((a) => a.subjectId),
      ...elective.map((a) => a.subjectId),
    ]),
  ];

  return { teacher, authorizedSet, subjectIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Overdue status resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a recipient's effective status at read time.
 *
 * IMPORTANT: OVERDUE is NEVER written to the database.
 * Only PENDING and COMPLETED are stored in DiaryRecipient.status.
 * This function computes OVERDUE dynamically by comparing dueDate to now.
 */
export function resolveStatus(
  storedStatus: "PENDING" | "COMPLETED",
  dueDate: Date | null | undefined
): "PENDING" | "COMPLETED" | "OVERDUE" {
  if (storedStatus === "COMPLETED") return "COMPLETED";
  if (dueDate && new Date() > new Date(dueDate)) return "OVERDUE";
  return "PENDING";
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification creation (fire-and-forget)
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  ASSIGNMENT:   "Assignment",
  HOMEWORK:     "Homework",
  REVISION:     "Revision",
  PROJECT:      "Project",
  ANNOUNCEMENT: "Announcement",
};

function formatDay(date: Date): string {
  return new Date(date).toLocaleDateString("en-KE", {
    weekday: "short",
    day:     "numeric",
    month:   "short",
  });
}

/**
 * Creates DiaryNotification rows for every student (who has a userId) and
 * every parent user (matched by student.parentContact email).
 *
 * Always runs inside a try/catch — notification failures MUST never roll back
 * the DiaryEntry creation (Requirement 9.6).
 *
 * Call this AFTER the main transaction has committed, and do NOT await it
 * in the API response path if you want true fire-and-forget behaviour.
 */
export async function createDiaryNotifications(
  entry: {
    id:        string;
    schoolId:  string;
    entryType: string;
    dueDate:   Date | null | undefined;
  },
  studentIds: string[],
  subjectName: string
): Promise<void> {
  try {
    if (studentIds.length === 0) return;

    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id:            true,
        fullName:      true,
        userId:        true,
        parentContact: true,
      },
    });

    const typeLabel     = TYPE_LABELS[entry.entryType] ?? entry.entryType;
    const isAnnouncement = entry.entryType === "ANNOUNCEMENT";
    // Due date segment is omitted for ANNOUNCEMENTs (Req 9.4)
    const dueStr =
      !isAnnouncement && entry.dueDate
        ? ` Due ${formatDay(new Date(entry.dueDate))}.`
        : "";

    const notifications: {
      schoolId:     string;
      diaryEntryId: string;
      userId:       string;
      message:      string;
    }[] = [];

    // Build a map of parent emails we've already processed to avoid duplicates
    const processedParentEmails = new Set<string>();

    for (const student of students) {
      const firstName = student.fullName.split(" ")[0] ?? student.fullName;
      const msg = `📚 New ${subjectName} ${typeLabel} — ${firstName} has a new ${subjectName} ${typeLabel.toLowerCase()}.${dueStr}`;

      // Notify the student's own user account (if they have one)
      if (student.userId) {
        notifications.push({
          schoolId:     entry.schoolId,
          diaryEntryId: entry.id,
          userId:       student.userId,
          message:      msg,
        });
      }

      // Notify the parent user (matched by parentContact email)
      if (student.parentContact && !processedParentEmails.has(student.parentContact)) {
        processedParentEmails.add(student.parentContact);
        const parentUser = await prisma.user.findFirst({
          where: {
            email:    student.parentContact,
            schoolId: entry.schoolId,
            role:     "PARENT",
          },
          select: { id: true },
        });
        if (parentUser) {
          notifications.push({
            schoolId:     entry.schoolId,
            diaryEntryId: entry.id,
            userId:       parentUser.id,
            message:      msg,
          });
        }
      }
    }

    if (notifications.length > 0) {
      await prisma.diaryNotification.createMany({
        data:           notifications,
        skipDuplicates: true,
      });
    }
  } catch (err) {
    // Non-fatal: log but never throw — must not roll back diary entry creation
    console.error("[DiaryNotifications] Failed to create notifications:", err);
  }
}
