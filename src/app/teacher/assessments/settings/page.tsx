import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";
import HODFormulaSettings from "@/components/assessment/HODFormulaSettings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * HOD Assessment Settings page — /teacher/assessments/settings
 *
 * Only accessible to users with the HOD assessment role.
 * Provides:
 *   - View of all active exam frameworks (read-only, for reference)
 *   - Per-subject, per-form formula editor for the HOD's own department
 */
export default async function HODAssessmentSettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const actor = await resolveAssessmentActor(user, user.schoolId);

  const isHOD = actor.roles.some((r) => r.role === "HOD");
  const isWide = actor.isPrincipal || actor.roles.some((r) =>
    ["DIRECTOR", "EXAM_OFFICER"].includes(r.role)
  );

  if (!isHOD && !isWide) {
    return (
      <div className="space-y-3 px-6 py-10">
        <h1 className="font-display text-xl font-semibold text-ink">Settings</h1>
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          This page is only available to Heads of Department.
        </div>
      </div>
    );
  }

  // ── Resolve the HOD's department ─────────────────────────────────────────
  let department: { id: string; name: string } | null = null;
  if (actor.teacher?.id) {
    department = await prisma.department.findFirst({
      where: { schoolId: user.schoolId, headTeacherId: actor.teacher.id },
      select: { id: true, name: true },
    });
    // Fall back to primary department if not head of any
    if (!department) {
      const t = await prisma.teacher.findUnique({
        where: { id: actor.teacher.id },
        select: { primaryDepartmentId: true },
      });
      if (t?.primaryDepartmentId) {
        department = await prisma.department.findUnique({
          where: { id: t.primaryDepartmentId },
          select: { id: true, name: true },
        });
      }
    }
  }

  if (!department) {
    return (
      <div className="space-y-3 px-6 py-10">
        <h1 className="font-display text-xl font-semibold text-ink">Settings</h1>
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          No department assigned. Contact the principal to be set as Head of Department.
        </div>
      </div>
    );
  }

  // ── Subjects in this department ──────────────────────────────────────────
  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId, departmentId: department.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, applicableForms: true },
  });

  // ── Active 8-4-4 frameworks (these are what papers belong to) ────────────
  const frameworks = await db.assessmentFramework.findMany({
    where: { schoolId: user.schoolId, isActive: true },
    orderBy: { academicYear: "desc" },
    select: {
      id: true,
      type: true,
      label: true,
      academicYear: true,
      isActive: true,
    },
  }) as Array<{ id: string; type: string; label: string; academicYear: string; isActive: boolean }>;

  // ── Existing formula configs for this department ─────────────────────────
  const existingFormulas = await db.departmentFormulaConfig.findMany({
    where: { schoolId: user.schoolId, departmentId: department.id },
    select: {
      id: true,
      subjectId: true,
      form: true,
      frameworkId: true,
      formula: true,
      updatedAt: true,
    },
  }) as Array<{
    id: string;
    subjectId: string;
    form: number;
    frameworkId: string;
    formula: string;
    updatedAt: string;
  }>;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">
          Department Settings
        </h1>
        <p className="text-sm text-slate mt-0.5">
          Configure mark calculation formulas for each subject and form group in{" "}
          <span className="font-medium text-ink">{department.name}</span>.
        </p>
      </div>

      <HODFormulaSettings
        department={department}
        subjects={subjects}
        frameworks={frameworks}
        initialFormulas={existingFormulas}
      />
    </div>
  );
}
