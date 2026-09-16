import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface TeacherClassCard {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  frameworkType: string;
  periodId: string | null;
  periodName: string | null;
  totalStudents: number;
  enteredCount: number;
}

/**
 * GET /api/assessments/home/teacher
 * Returns one card per (class, subject) assignment for the authenticated teacher.
 * Guard: authenticated TEACHER only (403 for other roles).
 *
 * Query params:
 *   periodId — optional; if supplied, entered counts are calculated for that
 *              period instead of the school's current period.
 *
 * DB optimisation: replaces a Promise.all loop that issued 2 × N queries
 * (one student.count + one assessmentItem.findMany per assignment) with two
 * batched queries — O(1) round-trips regardless of assignment count.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const periodIdParam = searchParams.get("periodId") ?? null;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!teacher) {
    return NextResponse.json({ cards: [] });
  }

  // A teacher can hold both 8-4-4 and CBE classes at once, and each
  // framework has its own independent set of periods — one dropdown value
  // can only ever belong to one framework. Every card must use the period
  // for its OWN class's framework: the explicitly-picked period when that's
  // its framework, otherwise that framework's own current period. There is
  // no sensible fallback to a period of a different framework — the ids
  // don't even correspond to the same AssessmentFramework, so silently
  // reusing one always produces a wrong "entered" count for the mismatched
  // classes (this is what caused CBE classes to look done/not-done at
  // random depending on whichever period happened to be selected).
  const [explicitPeriodRows, currentPeriods, assignments] = await Promise.all([
    periodIdParam
      ? db.assessmentPeriod.findMany({
          where: { id: periodIdParam, schoolId: user.schoolId! },
          select: { id: true, name: true, frameworkId: true,
                    framework: { select: { type: true } } },
        }) as Promise<Array<{ id: string; name: string; frameworkId: string; framework: { type: string } }>>
      : Promise.resolve([]),

    db.assessmentPeriod.findMany({
      where: { schoolId: user.schoolId!, isCurrent: true },
      select: { id: true, name: true, frameworkId: true,
                framework: { select: { type: true } } },
    }) as Promise<Array<{ id: string; name: string; frameworkId: string; framework: { type: string } }>>,

    db.classSubjectTeacher.findMany({
      where: { teacherId: teacher.id },
      select: {
        classId: true,
        subjectId: true,
        schoolClass: { select: { id: true, name: true, frameworkType: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
    }) as Promise<Array<{
      classId: string;
      subjectId: string;
      schoolClass: { id: string; name: string; frameworkType: string };
      subject: { id: string; name: string; code: string };
    }>>,
  ]);

  // Map framework type → period: the explicitly-picked one for its own
  // framework, that framework's current period for everyone else.
  const periodByFrameworkType = new Map<string, typeof currentPeriods[0]>();
  for (const p of currentPeriods) {
    periodByFrameworkType.set(p.framework.type, p);
  }
  const explicitPeriod = explicitPeriodRows[0] ?? null;
  if (explicitPeriod) {
    periodByFrameworkType.set(explicitPeriod.framework.type, explicitPeriod);
  }

  // Convenience: pick the best single period for the legacy resolvedPeriod
  // return value (used by the UI's dropdown display only).
  const resolvedPeriod = explicitPeriod ?? currentPeriods[0] ?? null;

  if (assignments.length === 0) {
    return NextResponse.json({ cards: [], currentPeriod: resolvedPeriod });
  }

  const assignedClassIds = [...new Set(assignments.map((a) => a.classId))];
  const assignedSubjectIds = [...new Set(assignments.map((a) => a.subjectId))];

  // Batch 1: student counts per class — one query instead of N.
  // Use groupBy so we get a count per classId without fetching all rows.
  const studentCountRows = await prisma.student.groupBy({
    by: ["classId"],
    where: { classId: { in: assignedClassIds }, schoolId: user.schoolId! },
    _count: { id: true },
  });
  const studentCountByClass = new Map(
    studentCountRows.map((r) => [r.classId, r._count.id])
  );

  // Batch 2: entered student IDs per (subjectId, classId), using each
  // class's own resolved (framework-correct) period — not just whichever
  // period(s) happened to be "current" globally.
  let enteredMap = new Map<string, number>(); // key: "classId:subjectId"
  const resolvedPeriods = [...periodByFrameworkType.values()];
  if (resolvedPeriods.length > 0) {
    const allPeriodIds = resolvedPeriods.map((p) => p.id);
    const enteredItems = await db.assessmentItem.findMany({
      where: {
        schoolId: user.schoolId!,
        periodId: { in: allPeriodIds },
        subjectId: { in: assignedSubjectIds },
        student: { classId: { in: assignedClassIds } },
      },
      distinct: ["studentId", "subjectId", "periodId"],
      select: {
        studentId: true, subjectId: true, periodId: true,
        student: { select: { classId: true } },
      },
    }) as Array<{ studentId: string; subjectId: string; periodId: string; student: { classId: string } }>;

    const buckets = new Map<string, Set<string>>();
    for (const item of enteredItems) {
      const key = `${item.student.classId}:${item.subjectId}`;
      const set = buckets.get(key) ?? new Set();
      set.add(item.studentId);
      buckets.set(key, set);
    }
    enteredMap = new Map(
      [...buckets.entries()].map(([k, s]) => [k, s.size])
    );
  }

  const cards: TeacherClassCard[] = assignments.map((a) => {
    // Pick the current period that matches this class's framework type.
    const period = periodByFrameworkType.get(a.schoolClass.frameworkType) ?? resolvedPeriod;
    return {
      classId: a.classId,
      className: a.schoolClass.name,
      subjectId: a.subjectId,
      subjectName: a.subject.name,
      subjectCode: a.subject.code,
      frameworkType: a.schoolClass.frameworkType,
      periodId: period?.id ?? null,
      periodName: period?.name ?? null,
      totalStudents: studentCountByClass.get(a.classId) ?? 0,
      enteredCount: enteredMap.get(`${a.classId}:${a.subjectId}`) ?? 0,
    };
  });

  // Sort: incomplete first, then alphabetical by class name.
  cards.sort((a, b) => {
    const aDone = a.enteredCount >= a.totalStudents && a.totalStudents > 0;
    const bDone = b.enteredCount >= b.totalStudents && b.totalStudents > 0;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.className.localeCompare(b.className);
  });

  return NextResponse.json({ cards, currentPeriod: resolvedPeriod });
}
