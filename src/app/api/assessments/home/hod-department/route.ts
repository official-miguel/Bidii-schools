import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface HODDeptCard {
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
  /** Teacher assigned to this class-subject, if any */
  teacherName: string | null;
}

/**
 * GET /api/assessments/home/hod-department
 *
 * Returns one card per (class × subject) pair for all classes in the HOD's
 * department. Only subjects belonging to the HOD's department are included.
 *
 * Access: HOD, DIRECTOR, EXAM_OFFICER, PRINCIPAL.
 *
 * Query params:
 *   periodId  — optional; defaults to the current period.
 *   classId   — optional; filter to a specific class.
 *   subjectId — optional; filter to a specific subject.
 *   form      — optional; filter by form/year group (integer).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const periodIdParam = searchParams.get("periodId") ?? null;
  const classIdFilter = searchParams.get("classId") ?? null;
  const subjectIdFilter = searchParams.get("subjectId") ?? null;
  const formFilter = searchParams.get("form") ? parseInt(searchParams.get("form")!, 10) : null;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "TEACHER" && user.role !== "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = await resolveAssessmentActor(user, user.schoolId!);

  const isHod = actor.roles.some((r) => r.role === "HOD");
  const isWide = actor.isPrincipal || actor.roles.some((r) =>
    ["DIRECTOR", "EXAM_OFFICER"].includes(r.role)
  );

  if (!isHod && !isWide) {
    return NextResponse.json({ error: "Forbidden — HOD or wider role required" }, { status: 403 });
  }

  // ── Resolve the HOD's department ─────────────────────────────────────────
  let departmentId: string | null = null;
  let departmentName = "";

  if (actor.teacher?.id) {
    const dept = await prisma.department.findFirst({
      where: { schoolId: user.schoolId!, headTeacherId: actor.teacher.id },
      select: { id: true, name: true },
    });
    if (dept) {
      departmentId = dept.id;
      departmentName = dept.name;
    } else {
      // Fall back to primary department
      const teacherRow = await prisma.teacher.findUnique({
        where: { id: actor.teacher.id },
        select: { primaryDepartmentId: true, primaryDepartment: { select: { name: true } } },
      });
      departmentId = teacherRow?.primaryDepartmentId ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      departmentName = (teacherRow as any)?.primaryDepartment?.name ?? "";
    }
  }

  if (!departmentId && !isWide) {
    return NextResponse.json({ error: "No department assigned." }, { status: 404 });
  }

  // ── Resolve subjects in this department ──────────────────────────────────
  const subjectWhere: Record<string, unknown> = {
    schoolId: user.schoolId!,
    ...(departmentId ? { departmentId } : {}),
  };
  if (subjectIdFilter) subjectWhere.id = subjectIdFilter;

  const deptSubjects = await prisma.subject.findMany({
    where: subjectWhere,
    select: { id: true, name: true, code: true, applicableForms: true },
    orderBy: { name: "asc" },
  });

  if (deptSubjects.length === 0) {
    return NextResponse.json({ cards: [], departmentName, currentPeriod: null });
  }

  const deptSubjectIds = deptSubjects.map((s) => s.id);

  // ── Resolve all classes in the school (HOD can view any class) ────────────
  const classWhere: Record<string, unknown> = { schoolId: user.schoolId! };
  if (classIdFilter) classWhere.id = classIdFilter;
  if (formFilter !== null && !isNaN(formFilter)) classWhere.form = formFilter;

  const allClasses = await db.schoolClass.findMany({
    where: classWhere,
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  }) as Array<{ id: string; name: string; form: number; frameworkType: string }>;

  if (allClasses.length === 0) {
    return NextResponse.json({ cards: [], departmentName, currentPeriod: null });
  }

  const allClassIds = allClasses.map((c) => c.id);

  // ── Resolve the period ────────────────────────────────────────────────────
  const resolvedPeriod = periodIdParam
    ? await db.assessmentPeriod.findFirst({
        where: { id: periodIdParam, schoolId: user.schoolId! },
        select: { id: true, name: true, frameworkId: true },
      }) as { id: string; name: string; frameworkId: string } | null
    : await db.assessmentPeriod.findFirst({
        where: { schoolId: user.schoolId!, isCurrent: true },
        select: { id: true, name: true, frameworkId: true },
      }) as { id: string; name: string; frameworkId: true } | null;

  // ── Batch: class-subject-teacher assignments for dept subjects ────────────
  const assignments = await db.classSubjectTeacher.findMany({
    where: {
      classId: { in: allClassIds },
      subjectId: { in: deptSubjectIds },
    },
    select: {
      classId: true,
      subjectId: true,
      teacher: { select: { fullName: true } },
    },
  }) as Array<{
    classId: string;
    subjectId: string;
    teacher: { fullName: string } | null;
  }>;

  // Build lookup: classId:subjectId → teacher name
  const teacherByPair = new Map<string, string | null>(
    assignments.map((a) => [`${a.classId}:${a.subjectId}`, a.teacher?.fullName ?? null])
  );

  // Only include class-subject pairs that have an explicit assignment OR
  // the subject is applicable to the class's form.
  const classById = new Map(allClasses.map((c) => [c.id, c]));
  const subjectById = new Map(deptSubjects.map((s) => [s.id, s]));

  // Build the set of valid (classId, subjectId) pairs.
  const pairs: Array<{ classId: string; subjectId: string }> = [];
  for (const cls of allClasses) {
    for (const subj of deptSubjects) {
      // Include if the subject is applicable to this form, or if there's an
      // explicit class-subject-teacher assignment.
      const applicable =
        subj.applicableForms.length === 0 || subj.applicableForms.includes(cls.form);
      const hasAssignment = teacherByPair.has(`${cls.id}:${subj.id}`);
      if (applicable || hasAssignment) {
        pairs.push({ classId: cls.id, subjectId: subj.id });
      }
    }
  }

  if (pairs.length === 0) {
    return NextResponse.json({ cards: [], departmentName, currentPeriod: resolvedPeriod });
  }

  const pairClassIds = [...new Set(pairs.map((p) => p.classId))];
  const pairSubjectIds = [...new Set(pairs.map((p) => p.subjectId))];

  // ── Batch: student counts per class ──────────────────────────────────────
  const studentCountRows = await prisma.student.groupBy({
    by: ["classId"],
    where: { classId: { in: pairClassIds }, schoolId: user.schoolId!, archivedAt: null },
    _count: { id: true },
  });
  const studentCountByClass = new Map(
    studentCountRows.map((r) => [r.classId, r._count.id])
  );

  // ── Batch: entered counts per (class, subject) for the resolved period ────
  let enteredMap = new Map<string, number>(); // "classId:subjectId"
  if (resolvedPeriod) {
    const enteredItems = await db.assessmentItem.findMany({
      where: {
        schoolId: user.schoolId!,
        periodId: resolvedPeriod.id,
        subjectId: { in: pairSubjectIds },
        student: { classId: { in: pairClassIds } },
      },
      distinct: ["studentId", "subjectId"],
      select: { studentId: true, subjectId: true, student: { select: { classId: true } } },
    }) as Array<{ studentId: string; subjectId: string; student: { classId: string } }>;

    const buckets = new Map<string, Set<string>>();
    for (const item of enteredItems) {
      const key = `${item.student.classId}:${item.subjectId}`;
      const set = buckets.get(key) ?? new Set();
      set.add(item.studentId);
      buckets.set(key, set);
    }
    enteredMap = new Map([...buckets.entries()].map(([k, s]) => [k, s.size]));
  }

  // ── Assemble cards ────────────────────────────────────────────────────────
  const cards: HODDeptCard[] = pairs.map(({ classId, subjectId }) => {
    const cls = classById.get(classId)!;
    const subj = subjectById.get(subjectId)!;
    return {
      classId,
      className: cls.name,
      subjectId,
      subjectName: subj.name,
      subjectCode: subj.code,
      frameworkType: cls.frameworkType,
      periodId: resolvedPeriod?.id ?? null,
      periodName: resolvedPeriod?.name ?? null,
      totalStudents: studentCountByClass.get(classId) ?? 0,
      enteredCount: enteredMap.get(`${classId}:${subjectId}`) ?? 0,
      teacherName: teacherByPair.get(`${classId}:${subjectId}`) ?? null,
    };
  });

  // Sort: incomplete first, then by class name, then subject name
  cards.sort((a, b) => {
    const aDone = a.enteredCount >= a.totalStudents && a.totalStudents > 0;
    const bDone = b.enteredCount >= b.totalStudents && b.totalStudents > 0;
    if (aDone !== bDone) return aDone ? 1 : -1;
    const classCmp = a.className.localeCompare(b.className);
    if (classCmp !== 0) return classCmp;
    return a.subjectName.localeCompare(b.subjectName);
  });

  return NextResponse.json({ cards, departmentName, currentPeriod: resolvedPeriod });
}
