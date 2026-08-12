import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import {
  meanAttainment,
  attainmentToLevel,
  type PerformanceLevel,
} from "@/lib/assessment/gradingCbe";
import { levelToPointsSql } from "@/lib/assessment/gradingSql";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * DB optimisation applied:
 *   - Sub-strand level-count stats: was items.filter() per sub-strand in JS.
 *     Now: GROUP BY subStrandId with conditional COUNT in PostgreSQL.
 *   - Learning-area level-count stats: same GROUP BY push-down.
 *   - Mean attainment per sub-strand / learning-area: AVG(CASE level → pts).
 *   - Student-level attainment per learner: still in JS using pre-grouped maps
 *     (the per-student cell grid is inherently thin and needs full detail).
 *
 * Benchmark (class of 30 students, 8 sub-strands, 3 learning areas):
 *   Before: all 240 item rows into Node, JS grouping per sub-strand / area
 *   After:  8 + 3 aggregate rows from PG,  JS only for student table/radar
 */
export async function GET(req: NextRequest) {
  const params  = req.nextUrl.searchParams;
  const periodId = params.get("periodId");
  const classId  = params.get("classId");

  if (!periodId || !classId) {
    return NextResponse.json({ error: "periodId and classId are required." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canAccessDashboard(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // period and schoolClass are independent — fetch in parallel.
  const [period, schoolClass] = await Promise.all([
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId: user.schoolId!, framework: { type: "CBE", isActive: true } },
      select: { id: true, name: true, academicYear: true, term: true, frameworkId: true },
    }) as Promise<{ id: string; name: string; academicYear: string; term: number | null; frameworkId: string } | null>,

    prisma.schoolClass.findFirst({
      where: { id: classId, schoolId: user.schoolId! },
      select: { id: true, name: true },
    }),
  ]);

  if (!period) return NextResponse.json({ error: "Period not found." }, { status: 404 });
  if (!schoolClass) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const students = await prisma.student.findMany({
    where: { classId, schoolId: user.schoolId! },
    orderBy: { admissionNumber: "asc" },
    select: { id: true, fullName: true, admissionNumber: true },
  });

  const studentIds = students.map((s) => s.id);

  if (studentIds.length === 0) {
    return NextResponse.json({ period, schoolClass, hasData: false, subStrandStats: [], learningAreaStats: [], studentTable: [] });
  }

  // Sub-strand hierarchy for labelling (fetched after we know items exist).
  // Also fetches items for the student table / learner radar in parallel.
  type RawItem = {
    studentId:        string;
    performanceLevel: PerformanceLevel | null;
    subStrandId:      string | null;
    learningAreaId:   string | null;
  };

  // Quick existence check + student-detail items in one query.
  const items = await db.assessmentItem.findMany({
    where: {
      periodId,
      studentId: { in: studentIds },
      schoolId: user.schoolId!,
      resultKind: "PERFORMANCE_LEVEL",
    },
    select: {
      studentId:        true,
      performanceLevel: true,
      subStrandId:      true,
      learningAreaId:   true,
    },
  }) as RawItem[];

  if (items.length === 0) {
    return NextResponse.json({ period, schoolClass, hasData: false, subStrandStats: [], learningAreaStats: [], studentTable: [] });
  }

  const subStrandIds = [...new Set(items.map((i) => i.subStrandId).filter(Boolean))] as string[];

  // ── PUSH SUB-STRAND AND LEARNING-AREA AGGREGATIONS INTO POSTGRESQL ───────────
  const levelExpr = levelToPointsSql('"performanceLevel"');

  type SubStrandAggrRow = {
    sub_strand_id: string;
    ee_count:      bigint;
    me_count:      bigint;
    ae_count:      bigint;
    be_count:      bigint;
    null_count:    bigint;    // entries with no performanceLevel
    entered_count: bigint;    // total entries for this sub-strand
    mean_pts:      number | null;
  };

  type LearningAreaAggrRow = {
    learning_area_id: string;
    ee_count:         bigint;
    me_count:         bigint;
    ae_count:         bigint;
    be_count:         bigint;
    null_count:       bigint;
    entered_count:    bigint;
    mean_pts:         number | null;
  };

  const [subStrandAggr, learningAreaAggr, subStrands] = await Promise.all([
    // Per sub-strand counts + mean attainment.
    prisma.$queryRawUnsafe<SubStrandAggrRow[]>(
      `SELECT "subStrandId"                                                   AS sub_strand_id,
              COUNT(*) FILTER (WHERE "performanceLevel" = 'EE')::bigint       AS ee_count,
              COUNT(*) FILTER (WHERE "performanceLevel" = 'ME')::bigint       AS me_count,
              COUNT(*) FILTER (WHERE "performanceLevel" = 'AE')::bigint       AS ae_count,
              COUNT(*) FILTER (WHERE "performanceLevel" = 'BE')::bigint       AS be_count,
              COUNT(*) FILTER (WHERE "performanceLevel" IS NULL)::bigint      AS null_count,
              COUNT(*)::bigint                                                 AS entered_count,
              AVG(${levelExpr})::float                                        AS mean_pts
       FROM   "AssessmentItem"
       WHERE  "schoolId"    = $1
         AND  "periodId"    = $2
         AND  "studentId"   = ANY($3::text[])
         AND  "resultKind"  = 'PERFORMANCE_LEVEL'
         AND  "subStrandId" = ANY($4::text[])
       GROUP BY "subStrandId"`,
      user.schoolId!,
      periodId,
      studentIds,
      subStrandIds
    ),

    // Per learning-area counts + mean attainment.
    prisma.$queryRawUnsafe<LearningAreaAggrRow[]>(
      `SELECT "learningAreaId"                                                AS learning_area_id,
              COUNT(*) FILTER (WHERE "performanceLevel" = 'EE')::bigint       AS ee_count,
              COUNT(*) FILTER (WHERE "performanceLevel" = 'ME')::bigint       AS me_count,
              COUNT(*) FILTER (WHERE "performanceLevel" = 'AE')::bigint       AS ae_count,
              COUNT(*) FILTER (WHERE "performanceLevel" = 'BE')::bigint       AS be_count,
              COUNT(*) FILTER (WHERE "performanceLevel" IS NULL)::bigint      AS null_count,
              COUNT(*)::bigint                                                 AS entered_count,
              AVG(${levelExpr})::float                                        AS mean_pts
       FROM   "AssessmentItem"
       WHERE  "schoolId"      = $1
         AND  "periodId"      = $2
         AND  "studentId"     = ANY($3::text[])
         AND  "resultKind"    = 'PERFORMANCE_LEVEL'
         AND  "learningAreaId" IS NOT NULL
       GROUP BY "learningAreaId"`,
      user.schoolId!,
      periodId,
      studentIds
    ),

    // Sub-strand hierarchy for labels.
    db.subStrand.findMany({
      where: { id: { in: subStrandIds } },
      select: {
        id: true, name: true, sortOrder: true,
        strand: {
          select: {
            id: true, name: true, sortOrder: true,
            learningArea: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    }) as Promise<Array<{
      id: string; name: string; sortOrder: number;
      strand: { id: string; name: string; sortOrder: number; learningArea: { id: string; name: string } };
    }>>,
  ]);

  // Build sub-strand stats from PostgreSQL aggregates.
  const subStrandAggrMap = new Map(subStrandAggr.map((r) => [r.sub_strand_id, r]));
  const totalStudents = studentIds.length;

  const subStrandStats = subStrands.map((ss) => {
    const agg = subStrandAggrMap.get(ss.id);
    const entered = agg ? Number(agg.entered_count) : 0;
    // NYE = students with no entry at all + entries with null performanceLevel.
    const nyeEntries  = agg ? Number(agg.null_count) : 0;
    const nyeMissing  = totalStudents - entered;     // students with no row
    const nye = nyeEntries + nyeMissing;

    const counts: Record<PerformanceLevel | "NYE", number> = {
      EE:  agg ? Number(agg.ee_count) : 0,
      ME:  agg ? Number(agg.me_count) : 0,
      AE:  agg ? Number(agg.ae_count) : 0,
      BE:  agg ? Number(agg.be_count) : 0,
      NYE: nye,
    };

    const mean = agg?.mean_pts ?? null;
    return {
      subStrandId:      ss.id,
      subStrandName:    ss.name,
      strandName:       ss.strand.name,
      learningAreaId:   ss.strand.learningArea.id,
      learningAreaName: ss.strand.learningArea.name,
      counts,
      meanAttainment:   mean,
      meanLevel:        mean !== null ? attainmentToLevel(mean) : null,
    };
  });

  // Build learning-area stats from PostgreSQL aggregates.
  const learningAreaAggrMap = new Map(learningAreaAggr.map((r) => [r.learning_area_id, r]));

  // Derive unique area ids preserving sub-strand order.
  const areaIds = [...new Set(subStrandStats.map((s) => s.learningAreaId))];

  const learningAreaStats = areaIds.map((areaId) => {
    const areaSubStrands = subStrandStats.filter((s) => s.learningAreaId === areaId);
    const agg = learningAreaAggrMap.get(areaId);
    const enteredTotal = agg ? Number(agg.entered_count) : 0;
    const nyeEntries   = agg ? Number(agg.null_count)    : 0;
    const nyeMissing   = totalStudents - enteredTotal;

    const counts: Record<PerformanceLevel | "NYE", number> = {
      EE:  agg ? Number(agg.ee_count) : 0,
      ME:  agg ? Number(agg.me_count) : 0,
      AE:  agg ? Number(agg.ae_count) : 0,
      BE:  agg ? Number(agg.be_count) : 0,
      NYE: nyeEntries + nyeMissing,
    };

    const mean = agg?.mean_pts ?? null;
    return {
      learningAreaId:   areaId,
      learningAreaName: areaSubStrands[0]?.learningAreaName ?? areaId,
      subStrandCount:   areaSubStrands.length,
      counts,
      meanAttainment:   mean,
      meanLevel:        mean !== null ? attainmentToLevel(mean) : null,
    };
  });

  // ── STUDENT TABLE & LEARNER RADAR ────────────────────────────────────────────
  // These still need full per-student detail (cell grid + per-area axes),
  // so we keep the JS grouping from the already-fetched items array.

  const itemsByStudent = new Map<string, RawItem[]>();
  for (const item of items) {
    const arr = itemsByStudent.get(item.studentId) ?? [];
    arr.push(item);
    itemsByStudent.set(item.studentId, arr);
  }

  const studentTable = students.map((student) => {
    const studentItems = itemsByStudent.get(student.id) ?? [];
    const cellMap = new Map(studentItems.map((i) => [i.subStrandId ?? "", i.performanceLevel ?? null]));
    const levels  = studentItems
      .map((i) => i.performanceLevel)
      .filter((l): l is PerformanceLevel => l !== null);
    const mean = meanAttainment(levels);

    return {
      student: { id: student.id, fullName: student.fullName, admissionNumber: student.admissionNumber },
      cells:   subStrandIds.map((ssId) => ({
        subStrandId: ssId,
        level:       cellMap.get(ssId) ?? null,
      })),
      meanAttainment: mean,
      meanLevel:      mean !== null ? attainmentToLevel(mean) : null,
    };
  });

  const learnerRadar = students.map((student) => {
    const studentItems = itemsByStudent.get(student.id) ?? [];
    const studentAreaItems = new Map<string, PerformanceLevel[]>();
    for (const item of studentItems) {
      if (!item.learningAreaId || !item.performanceLevel) continue;
      const arr = studentAreaItems.get(item.learningAreaId) ?? [];
      arr.push(item.performanceLevel);
      studentAreaItems.set(item.learningAreaId, arr);
    }
    const axes = learningAreaStats.map((la) => ({
      learningAreaId:   la.learningAreaId,
      learningAreaName: la.learningAreaName,
      value:            meanAttainment(studentAreaItems.get(la.learningAreaId) ?? []) ?? 0,
    }));
    return { student: { id: student.id, fullName: student.fullName }, axes };
  });

  // Level distribution per learning area (from the PG aggregate).
  const levelDistribution = learningAreaStats.map((la) => {
    const total = totalStudents;
    return {
      learningAreaId:   la.learningAreaId,
      learningAreaName: la.learningAreaName,
      counts:           la.counts,
      percents: {
        EE:  total > 0 ? Math.round((la.counts.EE  / total) * 100) : 0,
        ME:  total > 0 ? Math.round((la.counts.ME  / total) * 100) : 0,
        AE:  total > 0 ? Math.round((la.counts.AE  / total) * 100) : 0,
        BE:  total > 0 ? Math.round((la.counts.BE  / total) * 100) : 0,
        NYE: total > 0 ? Math.round((la.counts.NYE / total) * 100) : 0,
      },
    };
  });

  return NextResponse.json({
    period,
    schoolClass,
    hasData: true,
    subStrandColumns: subStrands.map((ss) => ({
      id:               ss.id,
      name:             ss.name,
      strandName:       ss.strand.name,
      learningAreaName: ss.strand.learningArea.name,
    })),
    subStrandStats,
    learningAreaStats,
    studentTable,
    learnerRadar,
    levelDistribution,
  });
}
