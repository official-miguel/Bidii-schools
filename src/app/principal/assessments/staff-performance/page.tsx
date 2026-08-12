import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import StaffPerformancePage from "@/components/assessment/StaffPerformancePage";
import Link from "next/link";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function StaffPerformanceRoute() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canAccessDashboard(actor)) redirect("/principal/assessments");

  const isHod = actor.roles.some((r) => r.role === "HOD");

  // HOD's own department (restricts their view to one dept).
  let hodDeptId: string | undefined;
  if (isHod && actor.teacher?.id) {
    const dept = await prisma.department.findFirst({
      where: { headTeacherId: actor.teacher.id },
      select: { id: true },
    });
    hodDeptId = dept?.id;
  }

  // All departments — used to populate the director tab bar up-front
  // (avoids a client-side round-trip on first paint).
  const allDepartments = !isHod
    ? await prisma.department.findMany({
        where: { schoolId: user.schoolId! },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "EIGHT_FOUR_FOUR", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const periods = framework
    ? (await db.assessmentPeriod.findMany({
        where: { schoolId: user.schoolId!, frameworkId: framework.id },
        orderBy: [{ academicYear: "desc" }, { term: "desc" }],
        select: { id: true, name: true, academicYear: true, term: true, isCurrent: true },
      }) as Array<{
        id: string;
        name: string;
        academicYear: string;
        term: number | null;
        isCurrent: boolean;
      }>)
    : [];

  const currentPeriodId =
    periods.find((p) => p.isCurrent)?.id ?? periods[0]?.id ?? "";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Staff Performance</h1>
          <p className="text-sm text-slate mt-0.5">
            Teacher ranking by composite score — entry completion, improvement, and class mean.
          </p>
        </div>
        <Link href="/principal/settings#ranking" className="text-xs text-royal hover:underline shrink-0">
          Configure ranking weights →
        </Link>
      </div>
      <StaffPerformancePage
        viewMode={isHod ? "hod" : "director"}
        periodId={currentPeriodId}
        departmentId={hodDeptId}
        currentTeacherId={actor.teacher?.id}
        periods={periods}
        initialDepartments={allDepartments}
      />
    </div>
  );
}
