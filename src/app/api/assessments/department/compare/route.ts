import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import { scoreToGradeSql } from "@/lib/assessment/gradingSql";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface DeptComparePeriod {
  periodId: string;
  periodName: string;
  term: number | null;
  academicYear: string;
}

export interface DeptCompareSeries {
  departmentId: string;
  departmentName: string;
  /** Index-aligned with `periods`. null = no data for that period. */
  means: (number | null)[];
}

export interface DeptComparePayload {
  periods: DeptComparePeriod[];
  series: DeptCompareSeries[];
}

/**
 * GET /api/assessments/department/compare
 * Query params: periodId (required — used to resolve the active framework)
 *
 * Returns mean grade points per period for every department in the school,
 * so the client can render a multi-line comparison chart.
 *
 * Auth: same as the single-dept analytics endpoint — canAccessDashboard.
 * HODs see the data too (they need to see where their dept sits vs others).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canAccessDashboard(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) {
    return NextResponse.json({ error: "periodId is required." }, { status: 400 });
  }

  // Resolve the framework from the supplied period.
  const periodRow = await db.assessmentPeriod.findFirst({
    where: { id: periodId, schoolId: user.schoolId! },
    select: { frameworkId: true },
  }) as { frameworkId: string } | null;

  if (!periodRow) {
    return NextResponse.json({ error: "Period not found." }, { status: 404 });
  }

  // All periods for this framework, chronological.
  const allPeriods = await db.assessmentPeriod.findMany({
    where: { schoolId: user.schoolId!, frameworkId: periodRow.frameworkId },
    orderBy: [{ academicYear: "asc" }, { term: "asc" }],
    select: { id: true, name: true, term: true, academicYear: true },
  }) as Array<{ id: string; name: string; term: number | null; academicYear: string }>;

  const allPeriodIds = allPeriods.map((p) => p.id);

  // All departments in the school.
  const departments = await prisma.department.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (departments.length === 0 || allPeriodIds.length === 0) {
    return NextResponse.json({
      periods: allPeriods.map((p) => ({
        periodId: p.id,
        periodName: p.name,
        term: p.term,
        academicYear: p.academicYear,
      })),
      series: [],
    } as DeptComparePayload);
  }

  // For each department, resolve its subject IDs so we can filter items.
  const allSubjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId!, departmentId: { in: departments.map((d) => d.id) } },
    select: { id: true, departmentId: true },
  });

  // Map: deptId → Set<subjectId>
  const deptSubjectMap = new Map<string, string[]>();
  for (const dept of departments) deptSubjectMap.set(dept.id, []);
  for (const subj of allSubjects) {
    if (subj.departmentId) deptSubjectMap.get(subj.departmentId)?.push(subj.id);
  }

  // Single bulk query: mean grade points grouped by (periodId, subjectId).
  // We then aggregate per-department in JS — avoids N dept queries.
  const pointsExpr = scoreToGradeSql('"numericScore"');

  const rows = await prisma.$queryRawUnsafe<
    Array<{ period_id: string; subject_id: string; mean_pts: number }>
  >(
    `SELECT "periodId"  AS period_id,
            "subjectId" AS subject_id,
            AVG(${pointsExpr})::float AS mean_pts
     FROM "AssessmentItem"
     WHERE "schoolId"      = $1
       AND "periodId"      = ANY($2::text[])
       AND "resultKind"    = 'NUMERIC'
       AND "numericScore"  IS NOT NULL
     GROUP BY "periodId", "subjectId"`,
    user.schoolId!,
    allPeriodIds
  );

  // Build: Map<periodId, Map<subjectId, meanPts>>
  const periodSubjectMean = new Map<string, Map<string, number>>();
  for (const row of rows) {
    let pm = periodSubjectMean.get(row.period_id);
    if (!pm) { pm = new Map(); periodSubjectMean.set(row.period_id, pm); }
    pm.set(row.subject_id, row.mean_pts);
  }

  // Aggregate per dept per period.
  const series: DeptCompareSeries[] = departments
    .filter((d) => (deptSubjectMap.get(d.id)?.length ?? 0) > 0)
    .map((dept) => {
      const subjIds = deptSubjectMap.get(dept.id) ?? [];
      const means = allPeriods.map((period) => {
        const pm = periodSubjectMean.get(period.id);
        if (!pm) return null;
        const vals = subjIds.map((sid) => pm.get(sid)).filter((v): v is number => v !== undefined);
        if (vals.length === 0) return null;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return Math.round(avg * 100) / 100;
      });
      return { departmentId: dept.id, departmentName: dept.name, means };
    });

  const periods: DeptComparePeriod[] = allPeriods.map((p) => ({
    periodId: p.id,
    periodName: p.name,
    term: p.term,
    academicYear: p.academicYear,
  }));

  return NextResponse.json({ periods, series } as DeptComparePayload);
}
