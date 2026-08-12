import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import DeptAnalyticsPage from "@/components/assessment/DeptAnalyticsPage";

export default async function DeptAnalyticsRoute() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canAccessDashboard(actor)) redirect("/principal/assessments");

  // HOD: only their own dept. Director/Principal: all depts.
  const isHod = actor.roles.some((r) => r.role === "HOD");
  let departments: Array<{ id: string; name: string }>;
  if (isHod && actor.teacher?.id) {
    const hodDept = await prisma.department.findFirst({
      where: { headTeacherId: actor.teacher.id },
      select: { id: true, name: true },
    });
    departments = hodDept ? [hodDept] : [];
  } else {
    departments = await prisma.department.findMany({
      where: { schoolId: user.schoolId! },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  // Classes — all 8-4-4 classes (ExamFilterBar filters by form/stream internally).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const classes = await (prisma as any).schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true },
  }) as Array<{ id: string; name: string; form: number }>;

  // Subjects — all, ExamFilterBar filters by applicableForms internally.
  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
    select: { id: true, name: true, applicableForms: true },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Department Analytics</h1>
        <p className="text-sm text-slate mt-0.5">Subject breakdown, trends, and class performance heatmap by department.</p>
      </div>
      {departments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-slate">
          No departments found. Add departments first.
        </div>
      ) : (
        <DeptAnalyticsPage
          departments={departments}
          defaultDepartmentId={departments[0]?.id}
          classes={classes}
          subjects={subjects}
        />
      )}
    </div>
  );
}
