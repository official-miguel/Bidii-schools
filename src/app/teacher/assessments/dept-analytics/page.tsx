import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";
import DeptAnalyticsPage from "@/components/assessment/DeptAnalyticsPage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Teacher dept-analytics page.
 *
 * Access:  Any teacher with a primary department, HOD, DIRECTOR, EXAM_OFFICER.
 * Scoping:
 *   - Plain teacher / HOD → sees only own department(s).
 *   - DIRECTOR / EXAM_OFFICER → see all departments.
 *   - Own department always listed first in the dropdown.
 */
export default async function TeacherDeptAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId!);

  const isWideAccess = actor.roles.some((r) =>
    ["DIRECTOR", "EXAM_OFFICER"].includes(r.role)
  );

  // Resolve all departments this teacher belongs to (primary + any secondary via roles).
  const ownDeptIds: string[] = [];
  if (actor.teacher?.id) {
    const t = await prisma.teacher.findUnique({
      where: { id: actor.teacher.id },
      select: { primaryDepartmentId: true },
    });
    if (t?.primaryDepartmentId) ownDeptIds.push(t.primaryDepartmentId);

    // Also pick up any department the teacher is HOD of (may differ from primary)
    const hodDepts = await prisma.department.findMany({
      where: { schoolId: user.schoolId!, headTeacherId: actor.teacher.id },
      select: { id: true },
    });
    for (const d of hodDepts) {
      if (!ownDeptIds.includes(d.id)) ownDeptIds.push(d.id);
    }
  }

  // If teacher has no dept at all, show friendly error
  if (!isWideAccess && ownDeptIds.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-xl font-semibold text-ink">Dept Analytics</h1>
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          You are not assigned to a department yet. Contact the principal to be assigned.
        </div>
      </div>
    );
  }

  // Build department list — wide access sees all, others see only own dept(s)
  let departments: Array<{ id: string; name: string }>;
  if (isWideAccess) {
    const all = await prisma.department.findMany({
      where: { schoolId: user.schoolId! },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    // Own dept first even for wide-access users
    const primaryId = ownDeptIds[0];
    departments = primaryId
      ? [
          ...all.filter((d) => d.id === primaryId),
          ...all.filter((d) => d.id !== primaryId),
        ]
      : all;
  } else {
    // Only own department(s) — ordered: primary first then others
    const owned = await prisma.department.findMany({
      where: { schoolId: user.schoolId!, id: { in: ownDeptIds } },
      select: { id: true, name: true },
    });
    // Sort so primaryDepartmentId appears first
    departments = [
      ...owned.filter((d) => d.id === ownDeptIds[0]),
      ...owned.filter((d) => d.id !== ownDeptIds[0]),
    ];
  }

  if (departments.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-xl font-semibold text-ink">Dept Analytics</h1>
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          No departments found.
        </div>
      </div>
    );
  }

  // Classes — scope to teacher's assigned classes unless wide access
  let classFilter: { id: { in: string[] } } | Record<string, never> = {};
  if (!isWideAccess && actor.teacher?.id) {
    const assignments = await prisma.classSubjectTeacher.findMany({
      where: { teacherId: actor.teacher.id },
      select: { classId: true },
    });
    const ids = [...new Set(assignments.map((a) => a.classId))];
    if (actor.classTeacherOfId) ids.push(actor.classTeacherOfId);
    const unique = [...new Set(ids)];
    classFilter = unique.length > 0 ? { id: { in: unique } } : { id: { in: ["__none__"] } };
  }

  const classes = await db.schoolClass.findMany({
    where: { schoolId: user.schoolId!, ...classFilter },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true },
  }) as Array<{ id: string; name: string; form: number }>;

  // Subjects — teacher's assigned subjects or all if wide access
  const subjectIds = isWideAccess || !actor.teacher?.id
    ? undefined
    : (await prisma.classSubjectTeacher.findMany({
        where: { teacherId: actor.teacher.id },
        select: { subjectId: true },
      })).map((a) => a.subjectId);

  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId!,
      ...(subjectIds ? { id: { in: subjectIds } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, applicableForms: true },
  });

  const primaryDeptName = departments[0]?.name ?? "Your Department";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Dept Analytics</h1>
        <p className="text-sm text-slate mt-0.5">
          Subject breakdown, trends, and class performance heatmap for your department.
          {!isWideAccess && (
            <span className="ml-2 inline-flex items-center rounded-full bg-royal/10 px-2 py-0.5 text-xs font-medium text-royal">
              {primaryDeptName}
            </span>
          )}
        </p>
      </div>
      <DeptAnalyticsPage
        departments={departments}
        defaultDepartmentId={departments[0]?.id}
        classes={classes}
        subjects={subjects}
      />
    </div>
  );
}
