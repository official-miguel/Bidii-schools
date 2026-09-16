import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import { scoreToGradeSql } from "@/lib/assessment/gradingSql";
import { loadCbeMarks } from "@/lib/assessment/cbeMarks";

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
 * Query params: periodId (required), framework (optional)
 *
 * Returns, per period, one mean per department, so the client can render a
 * multi-line comparison chart. `framework` is EIGHT_FOUR_FOUR (default) or
 * CBE, and scopes the figures to classes of that curriculum: 8-4-4 means are
 * KCSE grade points, CBE means are raw marks. They are never mixed — averaging
 * a CBE mark through the KCSE points scale is meaningless.
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
  const isCbe    = req.nextUrl.searchParams.get("framework") === "CBE";
  if (!periodId) {
    return NextResponse.json({ error: "periodId is required." }, { status: 400 });
  }

  const periodRow = await db.assessmentPeriod.findFirst({
    where: { id: periodId, schoolId: user.schoolId! },
    select: { id: true },
  }) as { id: string } | null;

  if (!periodRow) {
    return NextResponse.json({ error: "Period not found." }, { status: 404 });
  }

  // All periods for the school, chronological — periods are shared across
  // every framework now.
  const allPeriods = await db.assessmentPeriod.findMany({
    where: { schoolId: user.schoolId! },
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

  const periods: DeptComparePeriod[] = allPeriods.map((p) => ({
    periodId: p.id,
    periodName: p.name,
    term: p.term,
    academicYear: p.academicYear,
  }));

  // ── CBE: raw marks, resolved the way the mark sheet resolves them ────────
  // A formula is an arbitrary expression over named papers, so this cannot be
  // pushed into SQL the way the KCSE points conversion can.
  if (isCbe) {
    const cbeClasses = await prisma.schoolClass.findMany({
      where: { schoolId: user.schoolId!, frameworkType: "CBE" },
      select: { id: true, form: true },
    });
    const marks = await loadCbeMarks(user.schoolId!, allPeriodIds, cbeClasses);

    const series: DeptCompareSeries[] = departments
      .filter((d) => (deptSubjectMap.get(d.id)?.length ?? 0) > 0)
      .map((dept) => {
        const subjIds = deptSubjectMap.get(dept.id) ?? [];
        const means = allPeriods.map((period) => {
          const vals: number[] = [];
          for (const s of marks.students) {
            for (const sid of subjIds) {
              const m = marks.markFor(period.id, s.id, sid);
              if (m !== null) vals.push(m);
            }
          }
          if (vals.length === 0) return null;
          return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
        });
        return { departmentId: dept.id, departmentName: dept.name, means };
      });

    return NextResponse.json({ periods, series } as DeptComparePayload);
  }

  // ── 8-4-4: mean grade points, aggregated in PostgreSQL ───────────────────
  // Single bulk query grouped by (periodId, subjectId); per-department
  // aggregation happens in JS, which avoids N dept queries. The Student /
  // SchoolClass join keeps CBE classes out of the KCSE means.
  const pointsExpr = scoreToGradeSql('ai."numericScore"');

  // SAFE: pointsExpr is a server-side SQL expression from scoreToGradeSql() —
  // only fixed CASE/WHEN literals, no user input. Arrays are DB-returned IDs.
  const rows = await prisma.$queryRaw<
    Array<{ period_id: string; subject_id: string; mean_pts: number }>
  >(Prisma.sql`
    SELECT ai."periodId"  AS period_id,
           ai."subjectId" AS subject_id,
           AVG(${Prisma.raw(pointsExpr)})::float AS mean_pts
      FROM "AssessmentItem" ai
      JOIN "Student" st     ON st."id" = ai."studentId"
      JOIN "SchoolClass" sc ON sc."id" = st."classId"
     WHERE ai."schoolId"      = ${user.schoolId!}
       AND ai."periodId"      = ANY(${allPeriodIds}::text[])
       AND ai."resultKind"    = 'NUMERIC'
       AND ai."numericScore"  IS NOT NULL
       AND sc."frameworkType" = 'EIGHT_FOUR_FOUR'
     GROUP BY ai."periodId", ai."subjectId"`);

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

  return NextResponse.json({ periods, series } as DeptComparePayload);
}
