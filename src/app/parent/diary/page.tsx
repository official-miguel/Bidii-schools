/**
 * /parent/diary — Diary page for authenticated parents
 *
 * Server component. Fetches diary entries directly via Prisma, scoped to the
 * authenticated parent's active child's class. Renders the ParentDiaryList
 * client component.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import ParentDiaryList from "@/components/parent/ParentDiaryList";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: { child?: string };
}

export default async function ParentDiaryPage({ searchParams }: Props) {
  // 1. Auth guard — if no Parent record exists yet (legacy accounts), show
  //    the empty-children state rather than bouncing to the login page.
  //    The layout has already verified the user is authenticated and role=PARENT.
  const parent = await requireParent();
  if (!parent) {
    return (
      <div className="space-y-4">
        <PageHeader />
        <EmptyNoChildren />
      </div>
    );
  }

  // 2. Resolve studentId from ?child= param; fall back to first linked student
  let studentId = searchParams.child ?? null;

  if (!studentId) {
    const first = parent.students[0];
    if (!first) {
      return (
        <div className="space-y-4">
          <PageHeader />
          <EmptyNoChildren />
        </div>
      );
    }
    studentId = first.studentId;
  }

  // 3. Ownership check — silently fall back to first child if param is tampered
  if (!ownsStudent(parent, studentId)) {
    const first = parent.students[0];
    if (!first) {
      return (
        <div className="space-y-4">
          <PageHeader />
          <EmptyNoChildren />
        </div>
      );
    }
    studentId = first.studentId;
  }

  // 4. Fetch student name + classId
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { fullName: true, classId: true },
  });

  if (!student || !student.classId) {
    return (
      <div className="space-y-4">
        <PageHeader />
        <EmptyNoEntries studentName={student?.fullName} />
      </div>
    );
  }

  // 5. Query diary entries targeting the student's class
  const rawEntries = await prisma.diaryEntry.findMany({
    where: {
      schoolId:  parent.schoolId,
      deletedAt: null,
      targets:   { some: { classId: student.classId } },
    },
    include: {
      subject:    { select: { name: true } },
      recipients: {
        where:  { studentId },
        take:   1,
        select: { status: true },
      },
      teacher: { select: { fullName: true } },
    },
    orderBy: [
      { dueDate: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
  });

  // 6. Badge count — ASSIGNMENT or HOMEWORK due within next 7 days
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  in7Days.setHours(23, 59, 59, 999);

  const badgeCount = rawEntries.filter(
    (e) =>
      (e.entryType === "ASSIGNMENT" || e.entryType === "HOMEWORK") &&
      e.dueDate !== null &&
      e.dueDate >= today &&
      e.dueDate <= in7Days,
  ).length;

  // Serialise dates to strings for safe client-component transfer
  const entries: import("@/components/parent/ParentDiaryList").DiaryEntryWithExtras[] =
    rawEntries.map((e) => ({
      id:          e.id,
      title:       e.title,
      description: e.description,
      entryType:   e.entryType as "ASSIGNMENT" | "HOMEWORK" | "REVISION" | "PROJECT" | "ANNOUNCEMENT",
      dueDate:     e.dueDate ? e.dueDate.toISOString() : null,
      subject:     e.subject,
      teacher:     e.teacher,
      recipients:  e.recipients.map((r) => ({ status: r.status as "PENDING" | "COMPLETED" })),
    }));

  return (
    <div className="space-y-4">
      {/* Page heading */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">
            Diary — {student.fullName}
          </h1>
          <p className="text-sm text-slate dark:text-dark-muted mt-0.5">
            Assignments, homework and class announcements
          </p>
        </div>

        {/* Badge for upcoming due-soon items */}
        {badgeCount > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full
                           bg-warn-bg text-warn text-xs font-semibold">
            {badgeCount} assignment{badgeCount !== 1 ? "s" : ""} due this week
          </span>
        )}
      </div>

      {/* Main content */}
      {entries.length === 0 ? (
        <EmptyNoEntries studentName={student.fullName} />
      ) : (
        <ParentDiaryList entries={entries} studentId={studentId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">Diary</h1>
    </div>
  );
}

function EmptyNoChildren() {
  return (
    <div className="bg-card border border-line rounded-xl p-8 text-center dark:bg-dark-surface dark:border-dark-border">
      <p className="text-3xl mb-3">📔</p>
      <p className="text-sm font-medium text-ink dark:text-dark-text">No children linked</p>
      <p className="text-sm text-slate dark:text-dark-muted mt-1">
        Contact the school office to link your child&apos;s record.
      </p>
    </div>
  );
}

function EmptyNoEntries({ studentName }: { studentName?: string | null }) {
  return (
    <div className="bg-card border border-line rounded-xl p-8 text-center dark:bg-dark-surface dark:border-dark-border">
      <p className="text-3xl mb-3">📔</p>
      <p className="text-sm font-medium text-ink dark:text-dark-text">No assignments</p>
      <p className="text-sm text-slate dark:text-dark-muted mt-1">
        There are currently no diary entries
        {studentName ? ` for ${studentName}` : ""}.
      </p>
    </div>
  );
}
