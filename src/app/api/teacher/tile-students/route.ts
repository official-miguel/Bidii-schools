import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { subjectScore, scoreToGrade, meanGrade } from "@/lib/assessment/grading844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * GET /api/teacher/tile-students
 *
 * Returns students scoped to a specific people-tile (class teacher or subject
 * teacher), enriched with:
 *   - todayAttendance: "PRESENT" | "ABSENT" | "NOT_RECORDED"
 *   - examDelta: number | null  — change in mean points vs previous period
 *   - examTrend: "UP" | "DOWN" | "FLAT" | null
 *   - lastScore:  number | null — most recent mean points
 *   - prevScore:  number | null — previous mean points
 *
 * Query params:
 *   classId    — required
 *   subjectId  — optional; when provided, scope to that subject's assigned
 *                students (elective) or all students in the class (core)
 *   isClassTeacher — "1" when the tile is a class-teacher tile
 */
export async function GET(req: NextRequest) {
  const user = await requireRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp             = req.nextUrl.searchParams;
  const classId        = sp.get("classId");
  const subjectId      = sp.get("subjectId") ?? undefined;
  const isClassTeacher = sp.get("isClassTeacher") === "1";

  if (!classId) {
    return NextResponse.json({ error: "classId is required." }, { status: 400 });
  }

  // ── Auth: verify the teacher is allowed to see this tile ──────────────────
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      classTeacherOf: { select: { id: true } },
      subjectAssignments: { select: { classId: true, subjectId: true } },
      classElectiveGroupTeachers: { select: { classId: true, subjectId: true } },
    },
  });
  if (!teacher) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allowed =
    (isClassTeacher && teacher.classTeacherOf?.id === classId) ||
    teacher.subjectAssignments.some(
      (a) => a.classId === classId && (!subjectId || a.subjectId === subjectId)
    ) ||
    teacher.classElectiveGroupTeachers.some(
      (a) => a.classId === classId && (!subjectId || a.subjectId === subjectId)
    );

  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Students in scope ────────────────────────────────────────────────────
  // For elective subjects: only students enrolled in that elective.
  // For core/class-teacher tiles: all students in the class.
  let studentWhere: Record<string, unknown> = {
    classId,
    schoolId: user.schoolId,
    archivedAt: null,
  };

  // If subjectId provided and it's an elective, narrow to enrolled students
  if (subjectId && !isClassTeacher) {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { type: true },
    });
    if (subject?.type === "ELECTIVE") {
      studentWhere = {
        ...studentWhere,
        electives: { some: { subjectId } },
      };
    }
  }

  const students = await prisma.student.findMany({
    where: studentWhere,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      admissionNumber: true,
      parentName: true,
    },
  });

  if (students.length === 0) {
    return NextResponse.json({ students: [] });
  }

  const studentIds = students.map((s) => s.id);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  // ── Parallel: today's attendance + exam history ───────────────────────────
  const [attendanceRows, framework] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        classId,
        schoolId: user.schoolId,
        date: { gte: todayStart, lte: todayEnd },
        studentId: { in: studentIds },
      },
      select: { studentId: true, status: true },
    }),
    db.assessmentFramework.findFirst({
      where: { schoolId: user.schoolId, type: "EIGHT_FOUR_FOUR", isActive: true },
      select: { id: true },
    }) as Promise<{ id: true } | null>,
  ]);

  // Build attendance map
  const attMap = new Map<string, "PRESENT" | "ABSENT">(
    attendanceRows.map((r: { studentId: string; status: string }) => [
      r.studentId,
      r.status as "PRESENT" | "ABSENT",
    ])
  );

  // ── Exam delta per student ───────────────────────────────────────────────
  // Map: studentId → { lastScore, prevScore, delta, trend }
  type ExamInfo = {
    lastScore: number | null;
    prevScore: number | null;
    delta: number | null;
    trend: "UP" | "DOWN" | "FLAT" | null;
  };
  const examMap = new Map<string, ExamInfo>();

  if (framework) {
    const allSubjects = await prisma.subject.findMany({
      where: {
        schoolId: user.schoolId,
        // scope to this subject only if a subjectId is given, otherwise all
        ...(subjectId ? { id: subjectId } : {}),
      },
      select: { id: true },
    });
    const subjectIdsForExam = allSubjects.map((s: { id: string }) => s.id);

    const [periods, papers, allItems] = await Promise.all([
      db.assessmentPeriod.findMany({
        where: { schoolId: user.schoolId, frameworkId: framework.id },
        orderBy: [{ academicYear: "asc" }, { term: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      db.paper.findMany({
        where: {
          schoolId: user.schoolId,
          frameworkId: framework.id,
          subjectId: { in: subjectIdsForExam },
        },
        select: { id: true, maxMarks: true, subjectId: true },
      }),
      db.assessmentItem.findMany({
        where: {
          schoolId: user.schoolId,
          studentId: { in: studentIds },
          frameworkId: framework.id,
          resultKind: "NUMERIC",
        },
        select: { studentId: true, periodId: true, paperId: true, numericScore: true },
      }),
    ]);

    // Build paper lookup: subjectId → papers[]
    const papersBySubject = new Map<string, Array<{ id: string; maxMarks: number }>>();
    for (const p of papers as Array<{ id: string; maxMarks: number; subjectId: string }>) {
      const arr = papersBySubject.get(p.subjectId) ?? [];
      arr.push(p);
      papersBySubject.set(p.subjectId, arr);
    }

    // Build score lookup: "studentId:periodId:paperId" → numericScore
    const scoreKey = (sId: string, pId: string, papId: string) => `${sId}:${pId}:${papId}`;
    const scoreMap = new Map<string, number | null>();
    for (const item of allItems as Array<{ studentId: string; periodId: string; paperId: string; numericScore: number | null }>) {
      scoreMap.set(scoreKey(item.studentId, item.periodId, item.paperId), item.numericScore ?? null);
    }

    // For each student compute mean points per period, then take last two
    for (const student of students) {
      const periodPoints: Array<{ periodId: string; pts: number }> = [];

      for (const period of periods as Array<{ id: string }>) {
        const subjectPts = subjectIdsForExam.map((subjId: string) => {
          const sPapers = papersBySubject.get(subjId) ?? [];
          if (!sPapers.length) return null;
          const scores = sPapers.map((p) => {
            const k = scoreKey(student.id, period.id, p.id);
            return scoreMap.has(k) ? scoreMap.get(k) ?? null : null;
          });
          const pct = subjectScore(scores, sPapers.map((p) => p.maxMarks));
          return pct !== null ? scoreToGrade(pct).points : null;
        });

        const mg = meanGrade(subjectPts);
        if (mg) periodPoints.push({ periodId: period.id, pts: Math.round(mg.meanPoints * 100) / 100 });
      }

      const lastTwo = periodPoints.slice(-2);
      if (lastTwo.length === 0) {
        examMap.set(student.id, { lastScore: null, prevScore: null, delta: null, trend: null });
      } else if (lastTwo.length === 1) {
        examMap.set(student.id, { lastScore: lastTwo[0].pts, prevScore: null, delta: null, trend: null });
      } else {
        const prev  = lastTwo[0].pts;
        const last  = lastTwo[1].pts;
        const delta = Math.round((last - prev) * 100) / 100;
        examMap.set(student.id, {
          lastScore: last,
          prevScore: prev,
          delta,
          trend: delta > 0 ? "UP" : delta < 0 ? "DOWN" : "FLAT",
        });
      }
    }
  }

  // ── Assemble response ────────────────────────────────────────────────────
  const result = students.map((s) => {
    const att  = attMap.get(s.id);
    const exam = examMap.get(s.id);
    return {
      id:              s.id,
      fullName:        s.fullName,
      admissionNumber: s.admissionNumber,
      parentName:      s.parentName,
      todayAttendance: att ?? "NOT_RECORDED",
      lastScore:       exam?.lastScore ?? null,
      prevScore:       exam?.prevScore ?? null,
      delta:           exam?.delta    ?? null,
      trend:           exam?.trend    ?? null,
    };
  });

  return NextResponse.json({ students: result });
}
