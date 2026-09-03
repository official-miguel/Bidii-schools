/**
 * /parent/behaviour
 *
 * Server component. Displays parent-visible discipline records for the
 * authenticated parent's active child. Falls back to the first linked child
 * when ?child= is absent or unowned.
 *
 * Requirements: 8.1, 8.2
 */

import { redirect } from "next/navigation";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import DisciplineList from "@/components/parent/DisciplineList";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { child?: string };
}

export default async function BehaviourPage({ searchParams }: Props) {
  // 1. Auth guard
  const parent = await requireParent();
  if (!parent) redirect("/parent-login");

  // 2. Resolve active child — fall back to first linked child
  const requestedId = searchParams?.child;
  let studentId: string;

  if (requestedId && ownsStudent(parent, requestedId)) {
    studentId = requestedId;
  } else {
    const first = parent.students[0];
    if (!first) {
      return (
        <div className="space-y-4">
          <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">Behaviour</h1>
          <div className="rounded-xl border border-warn/20 bg-warn-bg p-5">
            <p className="text-sm font-medium text-warn">
              No student linked to your account.
            </p>
          </div>
        </div>
      );
    }
    studentId = first.studentId;
  }

  // 3. Fetch student name
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { fullName: true },
  });
  if (!student) redirect("/parent");

  // 4. Query parent-visible discipline records
  const rawRecords = await prisma.disciplineRecord.findMany({
    where: {
      studentId,
      isVisibleToParent: true,
    },
    orderBy: { dateOfOffence: "desc" },
    select: {
      id:            true,
      offence:       true,
      description:   true,
      actionTaken:   true,
      dateOfOffence: true,
      status:        true,
    },
  });

  // 5. Serialise dates
  const records = rawRecords.map((r) => ({
    id:            r.id,
    offence:       r.offence,
    description:   r.description ?? null,
    actionTaken:   r.actionTaken ?? null,
    resolution:    null,
    dateOfOffence: r.dateOfOffence.toISOString(),
    status:        r.status as "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "ESCALATED",
  }));

  const childName = student.fullName;

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">
        Behaviour — {childName}
      </h1>

      {/* Empty state or list */}
      {records.length === 0 ? (
        <div className="rounded-xl border border-line bg-card p-10 flex flex-col items-center gap-3 text-center dark:bg-dark-surface dark:border-dark-border">
          <div className="text-4xl">🌟</div>
          <div>
            <p className="text-sm font-semibold text-ink dark:text-dark-text">
              No behaviour matters
            </p>
            <p className="text-xs text-slate dark:text-dark-muted mt-1 max-w-xs">
              There are currently no parent-visible behaviour matters for {childName}.
            </p>
          </div>
        </div>
      ) : (
        <DisciplineList records={records} childName={childName} />
      )}
    </div>
  );
}
