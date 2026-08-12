import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UnifiedClassTable from "@/components/assessment/UnifiedClassTable";
import type { ClassRow } from "@/components/assessment/UnifiedClassTable";

interface PageProps {
  params: { form: string };
}

export async function generateMetadata({ params }: PageProps) {
  const formNum = parseInt(params.form, 10);
  return { title: `Form ${formNum} Streams — Exams & Analysis` };
}

export default async function FormStreamsPage({ params }: PageProps) {
  const formNum = parseInt(params.form, 10);
  if (isNaN(formNum) || formNum < 1) notFound();

  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  // Fetch current period for stats
  const currentPeriod = await prisma.assessmentPeriod.findFirst({
    where: { schoolId: user.schoolId!, isCurrent: true },
    select: { id: true },
  });

  // Fetch streams belonging to this form
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId!, form: formNum },
    orderBy: { name: "asc" },
    select: { id: true, name: true, form: true, frameworkType: true },
  });

  if (classes.length === 0) notFound();

  // Build stats per class when a current period exists
  let rows: ClassRow[];

  if (!currentPeriod) {
    rows = classes.map((c) => ({
      ...c,
      meanPoints: null,
      meanGrade: null,
      entryCompletionPct: 0,
    }));
  } else {
    const classIds = classes.map((c) => c.id);

    // Inline the grade-points expression used elsewhere in the codebase
    const pointsExpr = `CASE
      WHEN "numericScore" >= 80 THEN 12
      WHEN "numericScore" >= 75 THEN 11
      WHEN "numericScore" >= 70 THEN 10
      WHEN "numericScore" >= 65 THEN 9
      WHEN "numericScore" >= 60 THEN 8
      WHEN "numericScore" >= 55 THEN 7
      WHEN "numericScore" >= 50 THEN 6
      WHEN "numericScore" >= 45 THEN 5
      WHEN "numericScore" >= 40 THEN 4
      WHEN "numericScore" >= 35 THEN 3
      WHEN "numericScore" >= 30 THEN 2
      WHEN "numericScore" >= 25 THEN 1
      ELSE 0
    END`;

    type ClassAggrRow = {
      class_id: string;
      mean_pts: number | null;
      entered_count: bigint;
    };

    const aggr = await prisma.$queryRawUnsafe<ClassAggrRow[]>(
      `SELECT   s."classId"                    AS class_id,
                AVG(${pointsExpr})::float       AS mean_pts,
                COUNT(DISTINCT ai."studentId")  AS entered_count
       FROM     "AssessmentItem" ai
       JOIN     "Student" s ON s."id" = ai."studentId"
       WHERE    ai."periodId" = $1
         AND    s."classId" = ANY($2::text[])
       GROUP BY s."classId"`,
      currentPeriod.id,
      classIds
    );

    // Total active (non-archived) students per class for completion %
    const studentCounts = await prisma.student.groupBy({
      by: ["classId"],
      where: { classId: { in: classIds }, archivedAt: null },
      _count: { _all: true },
    });
    const studentMap = new Map(
      studentCounts.map((r) => [r.classId, r._count._all])
    );

    const aggrMap = new Map(aggr.map((r) => [r.class_id, r]));

    // Grade label helper
    function ptsToGrade(pts: number): string {
      if (pts >= 11.5) return "A";
      if (pts >= 10.5) return "A-";
      if (pts >= 9.5)  return "B+";
      if (pts >= 8.5)  return "B";
      if (pts >= 7.5)  return "B-";
      if (pts >= 6.5)  return "C+";
      if (pts >= 5.5)  return "C";
      if (pts >= 4.5)  return "C-";
      if (pts >= 3.5)  return "D+";
      if (pts >= 2.5)  return "D";
      if (pts >= 1.5)  return "D-";
      return "E";
    }

    rows = classes.map((c) => {
      const a = aggrMap.get(c.id);
      const totalStudents = studentMap.get(c.id) ?? 0;
      const enteredCount = a ? Number(a.entered_count) : 0;
      const entryCompletionPct =
        totalStudents > 0 ? Math.round((enteredCount / totalStudents) * 100) : 0;

      const meanPoints = a?.mean_pts ?? null;
      const meanGrade = meanPoints !== null ? ptsToGrade(meanPoints) : null;

      return {
        id: c.id,
        name: c.name,
        form: c.form,
        frameworkType: c.frameworkType,
        meanPoints,
        meanGrade,
        entryCompletionPct,
      };
    });
  }

  return (
    <div className="space-y-5">
      {/* Back breadcrumb */}
      <div>
        <Link
          href="/principal/assessments"
          className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All Classes
        </Link>
      </div>

      {/* Page heading */}
      <div>
        <h1 className="text-xl font-semibold text-ink dark:text-dark-text">
          Form {formNum}
        </h1>
        <p className="text-sm text-slate mt-0.5 dark:text-dark-muted">
          {rows.length} stream{rows.length !== 1 ? "s" : ""} — select one to view marks or dashboard.
        </p>
      </div>

      {/* Streams table — same design as All Classes */}
      <UnifiedClassTable rows={rows} role="principal" />
    </div>
  );
}
