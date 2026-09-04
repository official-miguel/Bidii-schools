/**
 * /parent/attendance
 *
 * Server component that displays a parent's child attendance history for the
 * current academic term, renders summary stats, triggers the 30-day absence
 * alert, and shows an empty state when no records exist.
 *
 * Requirements: 6.1–6.5
 */

import { redirect } from "next/navigation";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import { checkAttendanceAlert } from "@/lib/parentNotifications";
import AttendanceDotGrid from "@/components/parent/AttendanceDotGrid";
import AttendanceSummaryBar from "@/components/parent/AttendanceSummaryBar";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { child?: string };
}

export default async function AttendancePage({ searchParams }: Props) {
  // Auth guard
  const parent = await requireParent();
  if (!parent) redirect("/login");

  // Resolve active child
  const requestedId = searchParams?.child;
  let studentId: string;

  if (requestedId && ownsStudent(parent, requestedId)) {
    studentId = requestedId;
  } else {
    // Fall back to first linked child
    const first = parent.students[0];
    if (!first) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">Attendance</h1>
          <div className="rounded-xl border border-warn/20 bg-warn-bg p-5">
            <p className="text-sm font-medium text-warn">No student linked to your account.</p>
          </div>
        </div>
      );
    }
    studentId = first.studentId;
  }

  // Fetch student details
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { fullName: true, classId: true },
  });
  if (!student) redirect("/parent");

  const schoolId = parent.schoolId;
  const now      = new Date();

  // Determine term start date
  const activeTerm = await prisma.term.findFirst({
    where:   { schoolId, isActive: true },
    orderBy: { createdAt: "desc" },
    select:  { startDate: true },
  });

  const termStart: Date = activeTerm?.startDate
    ? activeTerm.startDate
    : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Fetch attendance records
  const rawRecords = await prisma.attendance.findMany({
    where:   { studentId, date: { gte: termStart } },
    orderBy: { date: "desc" },
    select:  { date: true, status: true },
  });

  // Trigger attendance alert server-side (deduplicated per month)
  await checkAttendanceAlert(parent, studentId, rawRecords);

  // Compute summary stats
  const totalPresent = rawRecords.filter((r) => r.status === "PRESENT").length;
  const totalAbsent  = rawRecords.filter((r) => r.status === "ABSENT").length;
  const total        = totalPresent + totalAbsent;
  const percentage   = total > 0 ? Math.round((totalPresent / total) * 100) : null;

  // Serialise dates for the client component
  const records = rawRecords.map((r) => ({
    date:   r.date.toISOString(),
    status: r.status as string,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">
          Attendance — {student.fullName}
        </h1>
        <p className="text-sm text-slate dark:text-dark-muted mt-1">
          {activeTerm?.startDate
            ? `From ${new Date(termStart).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}`
            : "Last 90 days"}
        </p>
      </div>

      {records.length === 0 ? (
        /* Empty state — requirement 6.5 */
        <div className="rounded-xl border border-line bg-card p-10 flex flex-col items-center gap-3 text-center dark:bg-dark-surface dark:border-dark-border">
          <p className="text-4xl">🗓️</p>
          <div>
            <p className="text-sm font-semibold text-ink dark:text-dark-text">
              No attendance recorded yet
            </p>
            <p className="text-xs text-slate dark:text-dark-muted mt-1">
              Attendance records will appear here once marked.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <AttendanceSummaryBar
            totalPresent={totalPresent}
            totalAbsent={totalAbsent}
            percentage={percentage}
          />

          {/* Dot calendar grid */}
          <div className="rounded-xl border border-line bg-card p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
            <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">
              Daily attendance
            </p>
            <AttendanceDotGrid records={records} />

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate dark:text-dark-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-success-bg" />
                Present
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-4 rounded bg-danger-bg" />
                Absent
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
