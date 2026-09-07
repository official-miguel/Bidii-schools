import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("ACCOMMODATION", "view"))
  );
}

// Cross-module analytics for dormitories (occupancy, discipline, attendance, academic, inspections)
// Query: dormId (optional), months (default 6)
export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const { searchParams } = req.nextUrl;
  const dormId = searchParams.get("dormId");
  const months = Math.min(parseInt(searchParams.get("months") ?? "6"), 24);
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const dormWhere = {
    schoolId,
    ...(dormId ? { id: dormId } : {}),
  };

  // ── Step 1: Load dorms with current students ───────────────────────────
  const dorms = await prisma.dormitory.findMany({
    where: dormWhere,
    include: {
      permittedForms: true,
      boardingMaster: { select: { fullName: true } },
      _count: {
        select: {
          allocations: { where: { status: "CURRENT" } },
          sleepingPositions: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  if (dorms.length === 0) {
    return NextResponse.json([]);
  }

  // ── Step 2: For each dorm, get the list of currently allocated studentIds
  const dormStudents = await prisma.allocationRecord.findMany({
    where: {
      schoolId,
      status: "CURRENT",
      dormId: dormId ? dormId : { in: dorms.map((d) => d.id) },
    },
    select: { dormId: true, studentId: true },
  });

  // Group studentIds by dormId
  const studentsByDorm = new Map<string, string[]>();
  for (const r of dormStudents) {
    const arr = studentsByDorm.get(r.dormId) ?? [];
    arr.push(r.studentId);
    studentsByDorm.set(r.dormId, arr);
  }

  // Collect all student IDs across all dorms
  const allStudentIds = dormStudents.map((r) => r.studentId);

  // ── Steps 3–7: run all independent cross-module queries in parallel ─────
  // PERF: these five queries are fully independent (all keyed on allStudentIds /
  // dormIds / schoolId). Running them sequentially added 300–800 ms per request.
  // Replacing take:50000 + in-process avg with a DB-side groupBy saves memory.
  const [
    attendanceRecords,
    disciplineRecords,
    assessmentAggRows,
    rawInspections,
    historicalAllocations,
  ] = await Promise.all([
    // Step 3: Attendance
    prisma.attendance.findMany({
      where: {
        schoolId,
        studentId: { in: allStudentIds },
        date: { gte: since },
      },
      select: { studentId: true, status: true, date: true },
    }),

    // Step 4: Discipline
    prisma.disciplineRecord.findMany({
      where: {
        schoolId,
        studentId: { in: allStudentIds },
        dateOfOffence: { gte: since },
      },
      select: { studentId: true, status: true, dateOfOffence: true },
    }),

    // Step 5: Assessment — aggregate avg/min/max per student in the DB
    // instead of fetching up to 50 000 rows into Node memory.
    prisma.assessmentItem.groupBy({
      by: ["studentId"],
      where: {
        schoolId,
        studentId: { in: allStudentIds },
        numericScore: { not: null },
        createdAt: { gte: since },
      },
      _avg: { numericScore: true },
      _min: { numericScore: true },
      _max: { numericScore: true },
      _count: { numericScore: true },
    }),

    // Step 6: Inspections (latest per dorm)
    prisma.dormInspection.findMany({
      where: {
        schoolId,
        status: "COMPLETED",
        dormId: dormId ? dormId : { in: dorms.map((d) => d.id) },
      },
      orderBy: { inspectionDate: "desc" },
      select: { dormId: true, overallScore: true, overallRating: true, inspectionDate: true },
      take: dorms.length,
    }).catch(() => [] as Array<{ dormId: string; overallScore: number | null; overallRating: string | null; inspectionDate: Date }>),

    // Step 7: Historical occupancy
    prisma.allocationRecord.findMany({
      where: {
        schoolId,
        dormId: dormId ? dormId : { in: dorms.map((d) => d.id) },
        allocationDate: { gte: since },
      },
      select: { dormId: true, allocationDate: true, status: true, vacatedDate: true },
      orderBy: { allocationDate: "asc" },
    }),
  ]);

  // Build inspection map from parallel result.
  const inspectionMap = new Map<string, { score: number | null; date: Date; rating: string | null }>();
  for (const ins of rawInspections) {
    if (!inspectionMap.has(ins.dormId)) {
      inspectionMap.set(ins.dormId, {
        score: ins.overallScore,
        date: ins.inspectionDate,
        rating: ins.overallRating,
      });
    }
  }

  // Build assessment aggregate map: studentId → { avg, min, max, count }
  type AssessmentAgg = { avg: number | null; min: number | null; max: number | null; count: number };
  const assessmentByStudent = new Map<string, AssessmentAgg>(
    assessmentAggRows.map((r) => [
      r.studentId,
      {
        avg: r._avg.numericScore != null ? Math.round(r._avg.numericScore) : null,
        min: r._min.numericScore != null ? Math.round(r._min.numericScore) : null,
        max: r._max.numericScore != null ? Math.round(r._max.numericScore) : null,
        count: r._count.numericScore,
      },
    ])
  );

  // ── Step 8: Compute per-dorm analytics ───────────────────────────────
  const result = dorms.map((dorm) => {
    const studentIds = studentsByDorm.get(dorm.id) ?? [];
    const studentSet = new Set(studentIds);
    const occupied = dorm._count.allocations;
    const capacity = dorm.totalCapacity;
    const available = Math.max(0, capacity - occupied);
    const occupancyPct = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;

    // Attendance
    const dormAttendance = attendanceRecords.filter((a) => studentSet.has(a.studentId));
    const presentCount = dormAttendance.filter((a) => a.status === "PRESENT").length;
    const absentCount = dormAttendance.filter((a) => a.status === "ABSENT").length;
    const totalAttendance = presentCount + absentCount;
    const attendancePct = totalAttendance > 0
      ? Math.round((presentCount / totalAttendance) * 100) : null;

    // Attendance by month
    const attendanceByMonth: Record<string, { present: number; absent: number }> = {};
    for (const a of dormAttendance) {
      const key = `${a.date.getFullYear()}-${String(a.date.getMonth() + 1).padStart(2, "0")}`;
      if (!attendanceByMonth[key]) attendanceByMonth[key] = { present: 0, absent: 0 };
      if (a.status === "PRESENT") attendanceByMonth[key].present++;
      else attendanceByMonth[key].absent++;
    }

    // Discipline
    const dormDiscipline = disciplineRecords.filter((d) => studentSet.has(d.studentId));
    const openCases = dormDiscipline.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW").length;
    const resolvedCases = dormDiscipline.filter((d) => d.status === "RESOLVED").length;
    const totalCases = dormDiscipline.length;

    // Academic — use pre-aggregated per-student stats from the DB groupBy.
    // Combine stats across all students in this dorm.
    const dormAggScores = studentIds
      .map((id) => assessmentByStudent.get(id))
      .filter((a): a is AssessmentAgg => a !== undefined && a.avg !== null);

    let avgScore: number | null = null;
    let minScore: number | null = null;
    let maxScore: number | null = null;
    let sampleSize = 0;
    if (dormAggScores.length > 0) {
      const avgs = dormAggScores.map((a) => a.avg!);
      avgScore = Math.round(avgs.reduce((s, v) => s + v, 0) / avgs.length);
      minScore = Math.round(Math.min(...dormAggScores.map((a) => a.min!)));
      maxScore = Math.round(Math.max(...dormAggScores.map((a) => a.max!)));
      sampleSize = dormAggScores.reduce((s, a) => s + a.count, 0);
    }

    // Inspection
    const lastInspection = inspectionMap.get(dorm.id) ?? null;

    // Movement history (monthly allocations)
    const dormHistory = historicalAllocations.filter((h) => h.dormId === dorm.id);
    const movementByMonth: Record<string, { in: number; out: number }> = {};
    for (const h of dormHistory) {
      // Count allocation as "in"
      const allocKey = `${h.allocationDate.getFullYear()}-${String(h.allocationDate.getMonth() + 1).padStart(2, "0")}`;
      if (!movementByMonth[allocKey]) movementByMonth[allocKey] = { in: 0, out: 0 };
      
      // Only count as "in" if status indicates an active allocation
      if (h.status === "CURRENT" || h.status === "MAINTENANCE_HOLD") {
        movementByMonth[allocKey].in++;
      }
      
      // Count as "out" when vacated or transferred
      if (h.vacatedDate) {
        const vacateKey = `${h.vacatedDate.getFullYear()}-${String(h.vacatedDate.getMonth() + 1).padStart(2, "0")}`;
        if (!movementByMonth[vacateKey]) movementByMonth[vacateKey] = { in: 0, out: 0 };
        movementByMonth[vacateKey].out++;
      }
    }

    return {
      id: dorm.id,
      name: dorm.name,
      genderPolicy: dorm.genderPolicy,
      status: dorm.status,
      structure: dorm.structure,
      boardingMasterName: dorm.boardingMaster?.fullName ?? null,
      capacity,
      occupied,
      available,
      occupancyPct,
      // Attendance
      attendance: {
        pct: attendancePct,
        present: presentCount,
        absent: absentCount,
        total: totalAttendance,
        byMonth: attendanceByMonth,
      },
      // Discipline
      discipline: {
        total: totalCases,
        open: openCases,
        resolved: resolvedCases,
        casesPer10Students: studentIds.length > 0
          ? Math.round((totalCases / studentIds.length) * 100) / 10 : 0,
      },
      // Academic
      academic: {
        avgScore,
        minScore,
        maxScore,
        sampleSize,
      },
      // Inspection
      inspection: lastInspection
        ? {
            score: lastInspection.score,
            rating: lastInspection.rating,
            date: lastInspection.date,
          }
        : null,
      // Movement
      movement: { byMonth: movementByMonth },
      // Risk indicators
      risks: [
        ...(attendancePct !== null && attendancePct < 80
          ? [{ type: "LOW_ATTENDANCE", message: `Attendance is ${attendancePct}% (below 80%)`, severity: "high" }]
          : []),
        ...(openCases > 3
          ? [{ type: "HIGH_INDISCIPLINE", message: `${openCases} open indiscipline cases`, severity: "medium" }]
          : []),
        ...(occupancyPct > 95
          ? [{ type: "NEAR_CAPACITY", message: `${occupancyPct}% occupancy — almost full`, severity: "medium" }]
          : []),
        ...(dorm.status === "UNDER_MAINTENANCE"
          ? [{ type: "MAINTENANCE", message: "Dormitory is under maintenance", severity: "high" }]
          : []),
      ],
    };
  });

  return NextResponse.json(result);
}
