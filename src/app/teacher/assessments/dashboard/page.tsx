import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";
import TeacherDashboardClient from "@/components/assessment/TeacherDashboardClient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Teacher In-depth Analysis page.
 *
 * Now renders:
 *   Tab 1 "My Classes"          — clickable class/subject tiles → full DashboardCharts
 *   Tab 2 "Full School Analysis" — DashboardCharts scoped to all school classes
 *
 * DIRECTOR / EXAM_OFFICER roles see everything (same as principal).
 */
export default async function TeacherDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId!);

  const isWideAccess = actor.roles.some((r) =>
    ["DIRECTOR", "EXAM_OFFICER"].includes(r.role)
  );

  // ── Classes scoped to this teacher ────────────────────────────────────────
  let teacherClassIds: string[] = [];
  if (!isWideAccess && actor.teacher?.id) {
    const assignments = await prisma.classSubjectTeacher.findMany({
      where: { teacherId: actor.teacher.id },
      select: { classId: true },
    });
    teacherClassIds = [...new Set(assignments.map((a) => a.classId))];
    if (actor.classTeacherOfId) teacherClassIds.push(actor.classTeacherOfId);
    teacherClassIds = [...new Set(teacherClassIds)];
  }

  const classFilter =
    !isWideAccess && teacherClassIds.length > 0
      ? { id: { in: teacherClassIds } }
      : !isWideAccess
      ? { id: { in: ["__none__"] } }
      : {};

  const allClasses = await db.schoolClass.findMany({
    where: { schoolId: user.schoolId!, ...classFilter },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  }) as Array<{ id: string; name: string; form: number; frameworkType: string }>;

  // ── ALL school classes (for Full School Analysis tab) ────────────────────
  const schoolClasses = await db.schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  }) as Array<{ id: string; name: string; form: number; frameworkType: string }>;

  // ── Subjects scoped to this teacher ──────────────────────────────────────
  const assignmentSubjectIds = isWideAccess || !actor.teacher?.id
    ? undefined
    : (await prisma.classSubjectTeacher.findMany({
        where: { teacherId: actor.teacher.id },
        select: { subjectId: true },
      })).map((a) => a.subjectId);

  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId!,
      ...(assignmentSubjectIds ? { id: { in: assignmentSubjectIds } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, applicableForms: true },
  });

  // ── All subjects (for Full School Analysis) ────────────────────────────
  const allSubjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
    select: { id: true, name: true, applicableForms: true },
  });

  // ── Build per-class subject assignments (for tiles) ───────────────────────
  type TileSubject = { id: string; name: string; code: string };
  type ClassTile   = { classId: string; className: string; form: number; frameworkType: string; subjects: TileSubject[] };

  let tiles: ClassTile[] = [];

  if (actor.teacher?.id && allClasses.length > 0) {
    // Fetch all (classId, subject) assignments for this teacher
    const classSubjectRows = await prisma.classSubjectTeacher.findMany({
      where: {
        teacherId: actor.teacher.id,
        classId: { in: allClasses.map((c) => c.id) },
      },
      select: {
        classId: true,
        subjectId: true,
        subject: { select: { id: true, name: true, code: true } },
      },
    });

    // Group by classId
    const byClass = new Map<string, TileSubject[]>();
    for (const row of classSubjectRows) {
      const existing = byClass.get(row.classId) ?? [];
      existing.push({ id: row.subject.id, name: row.subject.name, code: row.subject.code ?? "" });
      byClass.set(row.classId, existing);
    }

    tiles = allClasses.map((c) => ({
      classId: c.id,
      className: c.name,
      form: c.form,
      frameworkType: c.frameworkType,
      subjects: byClass.get(c.id) ?? [],
    }));
  } else {
    // Wide access: no subject drill — show class tiles with empty subject list
    tiles = allClasses.map((c) => ({
      classId: c.id,
      className: c.name,
      form: c.form,
      frameworkType: c.frameworkType,
      subjects: [],
    }));
  }

  // School-wide framework splits (for Full School Analysis)
  const schoolCbeClasses  = schoolClasses.filter((c) => c.frameworkType === "CBE");
  const schoolKcseClasses = schoolClasses.filter((c) => c.frameworkType !== "CBE");
  const schoolHasBoth     = schoolCbeClasses.length > 0 && schoolKcseClasses.length > 0;
  const schoolHasCbeOnly  = schoolCbeClasses.length > 0 && schoolKcseClasses.length === 0;

  if (allClasses.length === 0 && !isWideAccess) {
    return (
      <div className="space-y-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">In-depth Analysis</h1>
          <p className="text-sm text-slate mt-0.5">Analytics for your assigned classes and subjects.</p>
        </div>
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          No class assignments found. Contact the principal to be assigned to classes.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">In-depth Analysis</h1>
        <p className="text-sm text-slate mt-0.5">
          {isWideAccess
            ? "School-wide assessment analytics."
            : "Analytics for your assigned classes and subjects."}
        </p>
      </div>

      <TeacherDashboardClient
        tiles={tiles}
        subjects={subjects.map((s) => ({ id: s.id, name: s.name, applicableForms: s.applicableForms }))}
        isWideAccess={isWideAccess}
        hasBoth={schoolHasBoth}
        hasCbeOnly={schoolHasCbeOnly}
        kcseClasses={schoolKcseClasses}
        cbeClasses={schoolCbeClasses}
        cbeOnlyFlag={false}
        allSubjects={allSubjects}
      />
    </div>
  );
}
