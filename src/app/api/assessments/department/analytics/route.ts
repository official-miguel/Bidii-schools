import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import { scoreToGrade, pointsToGrade } from "@/lib/assessment/grading844";
import { scoreToGradeSql } from "@/lib/assessment/gradingSql";
import { resolveScale } from "@/lib/assessment/gradingScale";
import { loadCbeMarks } from "@/lib/assessment/cbeMarks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Which units the numbers in this payload are expressed in.
 *
 * 8-4-4 departments are measured in KCSE grade points (1–12, labelled A…E);
 * CBE departments are measured in raw marks (0–100, labelled EE1…BE2). The
 * charts read this to pick their axis domain, colour ramp and unit suffix
 * rather than assuming points.
 */
export interface AnalyticsScale {
  kind: "POINTS" | "MARKS";
  /** Top of the axis — 12 for points, 100 for marks. */
  max: number;
  /** Short unit suffix for tooltips, e.g. "pts" or "marks". */
  unit: string;
}

export interface SubjectBreakdownItem {
  subjectId: string;
  subjectName: string;
  /** Mean in the payload's own scale — grade points or raw marks. */
  mean: number | null;
  /** Grade letter (8-4-4) or achievement band (CBE) for that mean. */
  label: string | null;
}

export interface TrendDataPoint {
  periodId: string;
  periodName: string;
  term: number | null;
  academicYear: string;
  deptMean: number | null;
  schoolMean: number | null;
}

export interface HeatmapCell {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  mean: number | null;
}

export interface DeptAnalyticsPayload {
  departmentId: string;
  departmentName: string;
  scale: AnalyticsScale;
  subjectBreakdown: SubjectBreakdownItem[];
  trendData: TrendDataPoint[];
  heatmap: HeatmapCell[];
}

const POINTS_SCALE: AnalyticsScale = { kind: "POINTS", max: 12,  unit: "pts"   };
const MARKS_SCALE:  AnalyticsScale = { kind: "MARKS",  max: 100, unit: "marks" };

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean   = (xs: number[]) => (xs.length === 0 ? null : round2(xs.reduce((a, b) => a + b, 0) / xs.length));

/**
 * GET /api/assessments/department/analytics
 * Query params: periodId (required), departmentId (required), framework (optional)
 *
 * `framework` is EIGHT_FOUR_FOUR (default) or CBE, and scopes every figure to
 * classes of that curriculum. Previously the route aggregated across both at
 * once, which pushed CBE learners' marks through the KCSE points scale.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canAccessDashboard(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const periodId = params.get("periodId");
  const departmentId = params.get("departmentId");
  const frameworkParam = params.get("framework") === "CBE" ? "CBE" : "EIGHT_FOUR_FOUR";
  const isCbe = frameworkParam === "CBE";

  if (!periodId || !departmentId) {
    return NextResponse.json(
      { error: "periodId and departmentId are required." },
      { status: 400 }
    );
  }

  // HOD can only access their own department.
  const isHod = actor.roles.some((r) => r.role === "HOD");
  if (isHod && actor.teacher?.id) {
    const hodDept = await prisma.department.findFirst({
      where: { headTeacherId: actor.teacher.id },
      select: { id: true },
    });
    if (hodDept?.id !== departmentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Verify department, fetch its subjects, and resolve the classes in scope.
  const [department, deptSubjects, classes] = await Promise.all([
    prisma.department.findFirst({
      where: { id: departmentId, schoolId: user.schoolId! },
      select: { id: true, name: true },
    }),
    prisma.subject.findMany({
      where: { schoolId: user.schoolId!, departmentId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.schoolClass.findMany({
      where: { schoolId: user.schoolId!, frameworkType: frameworkParam },
      select: { id: true, name: true, form: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!department) {
    return NextResponse.json({ error: "Department not found." }, { status: 404 });
  }

  const scale = isCbe ? MARKS_SCALE : POINTS_SCALE;
  const deptSubjectIds = deptSubjects.map((s) => s.id);

  if (deptSubjectIds.length === 0 || classes.length === 0) {
    return NextResponse.json({
      departmentId,
      departmentName: department.name,
      scale,
      subjectBreakdown: [],
      trendData: [],
      heatmap: [],
    } as DeptAnalyticsPayload);
  }

  return isCbe
    ? cbeAnalytics({ user, periodId, department, deptSubjects, classes })
    : kcseAnalytics({ user, periodId, department, deptSubjects });
}

// ---------------------------------------------------------------------------
// Shared argument shapes
// ---------------------------------------------------------------------------

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type Dept        = { id: string; name: string };
type Subj        = { id: string; name: string };
type Cls         = { id: string; name: string; form: number };

// ---------------------------------------------------------------------------
// 8-4-4 — KCSE grade points, unchanged apart from being scoped to 8-4-4 classes
// ---------------------------------------------------------------------------

async function kcseAnalytics({
  user, periodId, department, deptSubjects,
}: {
  user: SessionUser; periodId: string; department: Dept; deptSubjects: Subj[];
}) {
  const deptSubjectIds = deptSubjects.map((s) => s.id);

  const items = await db.assessmentItem.findMany({
    where: {
      schoolId: user.schoolId!,
      periodId,
      subjectId: { in: deptSubjectIds },
      resultKind: "NUMERIC",
      student: { schoolClass: { frameworkType: "EIGHT_FOUR_FOUR" } },
    },
    select: { studentId: true, subjectId: true, numericScore: true,
              student: { select: { classId: true } } },
  }) as Array<{ studentId: string; subjectId: string | null; numericScore: number | null;
                student: { classId: string } }>;

  // --- Subject breakdown ---
  const itemsBySubject = new Map<string, typeof items>();
  for (const item of items) {
    if (!item.subjectId) continue;
    const arr = itemsBySubject.get(item.subjectId) ?? [];
    arr.push(item);
    itemsBySubject.set(item.subjectId, arr);
  }

  const subjectBreakdown: SubjectBreakdownItem[] = deptSubjects.map((subj) => {
    const subjItems = (itemsBySubject.get(subj.id) ?? []).filter((i) => i.numericScore !== null);
    if (subjItems.length === 0) {
      return { subjectId: subj.id, subjectName: subj.name, mean: null, label: null };
    }
    const pts = subjItems.map((i) => scoreToGrade(i.numericScore!).points);
    const m = round2(pts.reduce((a, b) => a + b, 0) / pts.length);
    return { subjectId: subj.id, subjectName: subj.name, mean: m, label: pointsToGrade(m) };
  });
  subjectBreakdown.sort((a, b) => (a.mean ?? 0) - (b.mean ?? 0));

  // ── TREND ────────────────────────────────────────────────────────────────
  // Two bulk queries across all periods rather than 2×N; the grade-point
  // conversion is pushed into PostgreSQL via AVG(CASE WHEN …).
  let trendData: TrendDataPoint[] = [];
  {
    const allPeriods = await db.assessmentPeriod.findMany({
      where: { schoolId: user.schoolId! },
      orderBy: [{ academicYear: "asc" }, { term: "asc" }],
      select: { id: true, name: true, term: true, academicYear: true },
    }) as Array<{ id: string; name: string; term: number | null; academicYear: string }>;

    const allPeriodIds = allPeriods.map((p) => p.id);

    if (allPeriodIds.length > 0) {
      const pointsExpr = scoreToGradeSql('ai."numericScore"');

      // SAFE: pointsExpr is a server-side SQL expression from scoreToGradeSql() —
      // only fixed CASE/WHEN literals. Arrays are DB-returned period/subject IDs.
      // The Student/SchoolClass join keeps CBE classes out of the KCSE means.
      const [deptRows, schoolRows] = await Promise.all([
        prisma.$queryRaw<Array<{ period_id: string; mean_pts: number | null }>>(Prisma.sql`
          SELECT ai."periodId" AS period_id,
                 AVG(${Prisma.raw(pointsExpr)})::float AS mean_pts
            FROM "AssessmentItem" ai
            JOIN "Student" st      ON st."id" = ai."studentId"
            JOIN "SchoolClass" sc  ON sc."id" = st."classId"
           WHERE ai."schoolId"   = ${user.schoolId!}
             AND ai."periodId"   = ANY(${allPeriodIds}::text[])
             AND ai."subjectId"  = ANY(${deptSubjectIds}::text[])
             AND ai."resultKind" = 'NUMERIC'
             AND ai."numericScore" IS NOT NULL
             AND sc."frameworkType" = 'EIGHT_FOUR_FOUR'
           GROUP BY ai."periodId"`),
        prisma.$queryRaw<Array<{ period_id: string; mean_pts: number | null }>>(Prisma.sql`
          SELECT ai."periodId" AS period_id,
                 AVG(${Prisma.raw(pointsExpr)})::float AS mean_pts
            FROM "AssessmentItem" ai
            JOIN "Student" st      ON st."id" = ai."studentId"
            JOIN "SchoolClass" sc  ON sc."id" = st."classId"
           WHERE ai."schoolId"   = ${user.schoolId!}
             AND ai."periodId"   = ANY(${allPeriodIds}::text[])
             AND ai."resultKind" = 'NUMERIC'
             AND ai."numericScore" IS NOT NULL
             AND sc."frameworkType" = 'EIGHT_FOUR_FOUR'
           GROUP BY ai."periodId"`),
      ]);

      const deptMeanByPeriod   = new Map(deptRows.map((r) => [r.period_id, r.mean_pts]));
      const schoolMeanByPeriod = new Map(schoolRows.map((r) => [r.period_id, r.mean_pts]));

      trendData = allPeriods.map((p) => {
        const dm = deptMeanByPeriod.get(p.id) ?? null;
        const sm = schoolMeanByPeriod.get(p.id) ?? null;
        return {
          periodId: p.id, periodName: p.name, term: p.term, academicYear: p.academicYear,
          deptMean:   dm !== null ? round2(dm) : null,
          schoolMean: sm !== null ? round2(sm) : null,
        };
      });
    }
  }

  // --- Heatmap: class × subject ---
  const classIds = [...new Set(items.map((i) => i.student.classId))];
  const classes = classIds.length > 0
    ? await prisma.schoolClass.findMany({
        where: { id: { in: classIds }, schoolId: user.schoolId! },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const heatAcc = new Map<string, { sum: number; count: number }>();
  for (const item of items) {
    if (item.numericScore === null || !item.subjectId) continue;
    const key  = `${item.student.classId}:${item.subjectId}`;
    const cell = heatAcc.get(key) ?? { sum: 0, count: 0 };
    cell.sum += scoreToGrade(item.numericScore).points;
    cell.count += 1;
    heatAcc.set(key, cell);
  }

  const heatmap: HeatmapCell[] = [];
  for (const cls of classes) {
    for (const subj of deptSubjects) {
      const cell = heatAcc.get(`${cls.id}:${subj.id}`);
      heatmap.push({
        classId: cls.id, className: cls.name,
        subjectId: subj.id, subjectName: subj.name,
        mean: cell && cell.count > 0 ? round2(cell.sum / cell.count) : null,
      });
    }
  }

  return NextResponse.json({
    departmentId: department.id,
    departmentName: department.name,
    scale: POINTS_SCALE,
    subjectBreakdown,
    trendData,
    heatmap,
  } as DeptAnalyticsPayload);
}

// ---------------------------------------------------------------------------
// CBE — raw marks and achievement bands
// ---------------------------------------------------------------------------
//
// Marks go through computeSubjectMark, so a department's figures agree with
// the mark sheet (papers totalled, or the HOD formula applied when one is set).
// That rules out the SQL shortcut the KCSE path uses, which can only see a
// bare numericScore column — the trend is aggregated in JS instead.

async function cbeAnalytics({
  user, periodId, department, deptSubjects, classes,
}: {
  user: SessionUser; periodId: string; department: Dept; deptSubjects: Subj[]; classes: Cls[];
}) {
  const deptSubjectIds  = new Set(deptSubjects.map((s) => s.id));

  const [scaleBands, allPeriods] = await Promise.all([
    resolveScale(user.schoolId!),
    db.assessmentPeriod.findMany({
      where: { schoolId: user.schoolId! },
      orderBy: [{ academicYear: "asc" }, { term: "asc" }],
      select: { id: true, name: true, term: true, academicYear: true },
    }) as Promise<Array<{ id: string; name: string; term: number | null; academicYear: string }>>,
  ]);

  const allPeriodIds = allPeriods.map((p) => p.id);
  const marks = await loadCbeMarks(
    user.schoolId!,
    allPeriodIds.length > 0 ? allPeriodIds : [periodId],
    classes
  );

  const emptyPayload: DeptAnalyticsPayload = {
    departmentId: department.id,
    departmentName: department.name,
    scale: MARKS_SCALE,
    subjectBreakdown: [],
    trendData: [],
    heatmap: [],
  };
  if (marks.students.length === 0) return NextResponse.json(emptyPayload);

  const sortedBands = [...scaleBands.bands].sort((a, b) => b.minPercentage - a.minPercentage);
  const bandFor = (mark: number | null): string | null => {
    if (mark === null || sortedBands.length === 0) return null;
    const clamped = Math.max(0, Math.min(100, mark));
    return (sortedBands.find((b) => clamped >= b.minPercentage)
      ?? sortedBands[sortedBands.length - 1]).bandName;
  };

  // --- Subject breakdown (selected period) ---
  const subjectBreakdown: SubjectBreakdownItem[] = deptSubjects.map((subj) => {
    const subjectMarks = marks.students
      .map((s) => marks.markFor(periodId, s.id, subj.id))
      .filter((v): v is number => v !== null);
    const m = mean(subjectMarks);
    return { subjectId: subj.id, subjectName: subj.name, mean: m, label: bandFor(m) };
  });
  subjectBreakdown.sort((a, b) => (a.mean ?? 0) - (b.mean ?? 0));

  // --- Trend: this department vs every CBE subject, across all periods ---
  const trendData: TrendDataPoint[] = allPeriods.map((p) => {
    const deptMarks: number[]   = [];
    const schoolMarks: number[] = [];
    for (const s of marks.students) {
      for (const subjectId of marks.subjectIdsWithData) {
        const m = marks.markFor(p.id, s.id, subjectId);
        if (m === null) continue;
        schoolMarks.push(m);
        if (deptSubjectIds.has(subjectId)) deptMarks.push(m);
      }
    }
    return {
      periodId: p.id, periodName: p.name, term: p.term, academicYear: p.academicYear,
      deptMean: mean(deptMarks), schoolMean: mean(schoolMarks),
    };
  });

  // --- Heatmap: class × subject (selected period) ---
  const studentsByClass = new Map<string, string[]>();
  for (const s of marks.students) {
    const arr = studentsByClass.get(s.classId) ?? [];
    arr.push(s.id);
    studentsByClass.set(s.classId, arr);
  }

  const heatmap: HeatmapCell[] = [];
  for (const cls of classes) {
    const ids = studentsByClass.get(cls.id) ?? [];
    if (ids.length === 0) continue;
    for (const subj of deptSubjects) {
      const cellMarks = ids
        .map((sid) => marks.markFor(periodId, sid, subj.id))
        .filter((v): v is number => v !== null);
      heatmap.push({
        classId: cls.id, className: cls.name,
        subjectId: subj.id, subjectName: subj.name,
        mean: mean(cellMarks),
      });
    }
  }

  return NextResponse.json({
    departmentId: department.id,
    departmentName: department.name,
    scale: MARKS_SCALE,
    subjectBreakdown,
    trendData,
    heatmap,
  } as DeptAnalyticsPayload);
}
