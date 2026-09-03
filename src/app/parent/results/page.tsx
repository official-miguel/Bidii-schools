/**
 * /parent/results — Academic Results page
 *
 * Server component. Fetches assessment periods and items directly via Prisma,
 * scoped to the authenticated parent's active child. Renders ResultsTable
 * and ResultsTrendChart client components.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { redirect } from "next/navigation";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import { computePeriodStats } from "@/lib/parentUtils";
import type { ResultPeriod } from "@/app/api/parent/results/route";
import ResultsTable from "@/components/parent/ResultsTable";
import ResultsTrendChart from "@/components/parent/ResultsTrendChart";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: { child?: string };
}

export default async function ParentResultsPage({ searchParams }: Props) {
  // 1. Auth guard
  const parent = await requireParent();
  if (!parent) {
    redirect("/parent-login");
  }

  // 2. Resolve studentId from ?child= param; fall back to first linked student
  let studentId = searchParams.child ?? null;

  if (!studentId) {
    const first = parent.students[0];
    if (!first) {
      // Parent has no linked students
      return (
        <div className="space-y-4">
          <PageHeader />
          <EmptyState />
        </div>
      );
    }
    studentId = first.studentId;
  }

  // Verify ownership — redirect to /parent if tampered
  if (!ownsStudent(parent, studentId)) {
    // Fall back to first child rather than erroring
    const first = parent.students[0];
    if (!first) {
      return (
        <div className="space-y-4">
          <PageHeader />
          <EmptyState />
        </div>
      );
    }
    studentId = first.studentId;
  }

  // 3. Fetch student name for the header
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { fullName: true },
  });

  // 4. Query all AssessmentPeriod records for the school ordered by
  //    academicYear DESC, term DESC
  const periods = await prisma.assessmentPeriod.findMany({
    where:   { schoolId: parent.schoolId },
    orderBy: [
      { academicYear: "desc" },
      { term: "desc" },
    ],
    select: {
      id:           true,
      name:         true,
      academicYear: true,
      term:         true,
    },
  });

  if (periods.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader studentName={student?.fullName} />
        <div className="bg-card border border-line rounded-xl p-8 text-center dark:bg-dark-surface dark:border-dark-border">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-medium text-ink dark:text-dark-text">
            No results yet
          </p>
          <p className="text-sm text-slate dark:text-dark-muted mt-1">
            Results and report cards will appear here once assessments are recorded.
          </p>
        </div>
      </div>
    );
  }

  // 5. Fetch all AssessmentItem rows for this student across all periods
  const periodIds = periods.map((p) => p.id);

  const allItems = await prisma.assessmentItem.findMany({
    where: {
      studentId,
      periodId: { in: periodIds },
    },
    select: {
      id:               true,
      periodId:         true,
      resultKind:       true,
      numericScore:     true,
      performanceLevel: true,
      competencyStatus: true,
      comment:          true,
      subject:          { select: { name: true } },
    },
  });

  // Group items by periodId
  const itemsByPeriod = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const bucket = itemsByPeriod.get(item.periodId) ?? [];
    bucket.push(item);
    itemsByPeriod.set(item.periodId, bucket);
  }

  // 6. Build ResultPeriod array
  const results: ResultPeriod[] = periods.map((period) => {
    const items = itemsByPeriod.get(period.id) ?? [];
    const stats = computePeriodStats(items);

    return {
      period: {
        id:           period.id,
        name:         period.name,
        academicYear: period.academicYear,
        term:         period.term,
      },
      items: items.map((item) => ({
        id:               item.id,
        resultKind:       item.resultKind,
        numericScore:     item.numericScore,
        performanceLevel: item.performanceLevel,
        competencyStatus: item.competencyStatus,
        comment:          item.comment,
        subject:          item.subject,
      })),
      stats,
    };
  });

  // Filter periods with actual data for the trend chart
  const hasAnyResults = results.some((r) => r.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader studentName={student?.fullName} />

      {!hasAnyResults ? (
        <div className="bg-card border border-line rounded-xl p-8 text-center dark:bg-dark-surface dark:border-dark-border">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-medium text-ink dark:text-dark-text">
            No results yet
          </p>
          <p className="text-sm text-slate dark:text-dark-muted mt-1">
            Results and report cards will appear here once assessments are recorded.
          </p>
        </div>
      ) : (
        <>
          {/* Trend chart — only shown when there's numeric data */}
          <ResultsTrendChart results={results} />

          {/* Period-by-period results table */}
          <ResultsTable results={results} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PageHeader({ studentName }: { studentName?: string | null }) {
  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">
        Academic Results{studentName ? ` — ${studentName}` : ""}
      </h1>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-card border border-line rounded-xl p-8 text-center dark:bg-dark-surface dark:border-dark-border">
      <p className="text-3xl mb-3">📊</p>
      <p className="text-sm font-medium text-ink dark:text-dark-text">
        No results yet
      </p>
      <p className="text-sm text-slate dark:text-dark-muted mt-1">
        Results and report cards will appear here once assessments are recorded.
      </p>
    </div>
  );
}
