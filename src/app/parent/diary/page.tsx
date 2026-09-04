/**
 * /parent/diary — Diary page for authenticated parents
 *
 * Server component. Fetches diary entries via Prisma, scoped to the
 * authenticated parent's selected child's class. Supports multi-child
 * switching via ?child= query param.
 */

import Link from "next/link";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import ParentDiaryList from "@/components/parent/ParentDiaryList";
import { BookOpen, AlertCircle, Users, CalendarClock } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: { child?: string };
}

export default async function ParentDiaryPage({ searchParams }: Props) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const parent = await requireParent();
  if (!parent) {
    return (
      <div className="space-y-4">
        <PageHeader />
        <EmptyNoChildren />
      </div>
    );
  }

  // ── Resolve active child ──────────────────────────────────────────────────
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

  // Ownership guard — silently fall back to first child if param is tampered
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

  // ── Fetch active student details ──────────────────────────────────────────
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { fullName: true, classId: true, schoolClass: { select: { name: true } } },
  });

  if (!student || !student.classId) {
    return (
      <div className="space-y-4">
        <PageHeader />
        <EmptyNoEntries studentName={student?.fullName} />
      </div>
    );
  }

  // ── Fetch all linked children for the switcher ────────────────────────────
  const allChildren = await prisma.student.findMany({
    where: {
      id: { in: parent.students.map((ps) => ps.studentId) },
    },
    select: {
      id:          true,
      fullName:    true,
      schoolClass: { select: { name: true } },
    },
    orderBy: { fullName: "asc" },
  });

  // ── Fetch diary entries for active child's class ──────────────────────────
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
      { dueDate:    { sort: "desc", nulls: "last" } },
      { createdAt:  "desc" },
    ],
  });

  // ── Badge count — due within 7 days ──────────────────────────────────────
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

  // ── Serialise dates to strings ────────────────────────────────────────────
  const entries: import("@/components/parent/ParentDiaryList").DiaryEntryWithExtras[] =
    rawEntries.map((e) => ({
      id:          e.id,
      title:       e.title,
      description: e.description,
      entryType:   e.entryType as "ASSIGNMENT" | "HOMEWORK" | "REVISION" | "PROJECT" | "ANNOUNCEMENT",
      dueDate:     e.dueDate    ? e.dueDate.toISOString()    : null,
      createdAt:   e.createdAt.toISOString(),
      subject:     e.subject,
      teacher:     e.teacher,
      recipients:  e.recipients.map((r) => ({ status: r.status as "PENDING" | "COMPLETED" })),
    }));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">
            Diary
          </h1>
          <p className="text-sm text-slate dark:text-dark-muted mt-0.5">
            {student.fullName} · {student.schoolClass?.name}
          </p>
        </div>

        {badgeCount > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                           bg-warn-bg text-warn text-xs font-semibold">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {badgeCount} due this week
          </span>
        )}
      </div>

      {/* Multi-child switcher */}
      {allChildren.length > 1 && (
        <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Select child">
          {allChildren.map((child) => {
            const isActive = child.id === studentId;
            const initials = child.fullName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return (
              <Link
                key={child.id}
                href={`/parent/diary?child=${child.id}`}
                role="tab"
                aria-selected={isActive}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left
                            transition-all min-h-[52px] no-underline
                            ${isActive
                              ? "border-teal/50 bg-teal/5 dark:bg-teal/10 shadow-xs"
                              : "border-line dark:border-dark-border hover:border-teal/40 hover:bg-teal/5 dark:hover:border-teal/30"
                            }`}
              >
                <div
                  className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0
                    ${isActive
                      ? "bg-teal text-white"
                      : "bg-teal/10 text-teal"
                    }`}
                  aria-hidden="true"
                >
                  {initials}
                </div>
                <div>
                  <p className={`text-sm font-medium leading-none ${isActive ? "text-teal" : "text-ink dark:text-dark-text"}`}>
                    {child.fullName.split(" ")[0]}
                  </p>
                  <p className="text-xs text-slate dark:text-dark-muted mt-0.5 leading-none">
                    {child.schoolClass.name}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Entries or empty */}
      {entries.length === 0 ? (
        <EmptyNoEntries studentName={student.fullName} />
      ) : (
        <ParentDiaryList entries={entries} studentId={studentId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — no emojis, icons only
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
    <div className="bg-card border border-line rounded-xl p-10 text-center dark:bg-dark-surface dark:border-dark-border">
      <div className="w-12 h-12 rounded-full bg-teal/10 flex items-center justify-center mx-auto mb-3">
        <Users className="h-6 w-6 text-teal" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-ink dark:text-dark-text">No children linked</p>
      <p className="text-sm text-slate dark:text-dark-muted mt-1">
        Contact the school office to link your child&apos;s record to your account.
      </p>
    </div>
  );
}

function EmptyNoEntries({ studentName }: { studentName?: string | null }) {
  return (
    <div className="bg-card border border-line rounded-xl p-10 text-center dark:bg-dark-surface dark:border-dark-border">
      <div className="w-12 h-12 rounded-full bg-teal/10 flex items-center justify-center mx-auto mb-3">
        <BookOpen className="h-6 w-6 text-teal" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-ink dark:text-dark-text">No diary entries yet</p>
      <p className="text-sm text-slate dark:text-dark-muted mt-1">
        {studentName
          ? `No assignments or announcements have been posted for ${studentName} yet.`
          : "No assignments or announcements have been posted yet."}
      </p>
    </div>
  );
}

// Suppress unused import lint warning — kept for future use
void AlertCircle;
