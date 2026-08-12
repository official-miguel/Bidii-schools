import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";
import StaffPerformancePage from "@/components/assessment/StaffPerformancePage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Teacher staff-performance / ranking page.
 *
 * Passes all departments the teacher belongs to so the page can show a
 * dept-filter dropdown when they are in more than one department.
 */
export default async function TeacherRankingPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId!);

  // Collect all departments this teacher belongs to (primary + HOD roles).
  const ownDeptIds: string[] = [];
  let primaryDeptId: string | undefined;

  if (actor.teacher?.id) {
    const t = await prisma.teacher.findUnique({
      where: { id: actor.teacher.id },
      select: { primaryDepartmentId: true },
    });
    primaryDeptId = t?.primaryDepartmentId ?? undefined;
    if (primaryDeptId) ownDeptIds.push(primaryDeptId);

    // Also pick up any department where this teacher is HOD
    const hodDepts = await prisma.department.findMany({
      where: { schoolId: user.schoolId!, headTeacherId: actor.teacher.id },
      select: { id: true },
    });
    for (const d of hodDepts) {
      if (!ownDeptIds.includes(d.id)) ownDeptIds.push(d.id);
    }
  }

  // Fetch dept stubs for the teacher's departments
  const teacherDepartments =
    ownDeptIds.length > 0
      ? await prisma.department.findMany({
          where: { schoolId: user.schoolId!, id: { in: ownDeptIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];

  // Put primary dept first in the list
  const sortedTeacherDepts = primaryDeptId
    ? [
        ...teacherDepartments.filter((d) => d.id === primaryDeptId),
        ...teacherDepartments.filter((d) => d.id !== primaryDeptId),
      ]
    : teacherDepartments;

  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "EIGHT_FOUR_FOUR", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const periods = framework
    ? (await db.assessmentPeriod.findMany({
        where: { schoolId: user.schoolId!, frameworkId: framework.id },
        orderBy: [{ academicYear: "desc" }, { term: "desc" }],
        select: {
          id: true, name: true, academicYear: true, term: true, isCurrent: true,
        },
      }) as Array<{
        id: string; name: string; academicYear: string;
        term: number | null; isCurrent: boolean;
      }>)
    : [];

  const currentPeriodId =
    periods.find((p) => p.isCurrent)?.id ?? periods[0]?.id ?? "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Staff Performance</h1>
        <p className="text-sm text-slate mt-0.5">
          Your ranking, department peers, and the school&apos;s top performers.
        </p>
      </div>
      <StaffPerformancePage
        viewMode="teacher"
        periodId={currentPeriodId}
        departmentId={primaryDeptId}
        teacherDepartments={sortedTeacherDepts}
        currentTeacherId={actor.teacher?.id}
        periods={periods}
      />
    </div>
  );
}
