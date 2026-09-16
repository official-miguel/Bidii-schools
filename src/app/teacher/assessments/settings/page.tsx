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
  try {
    console.log('[HOD Settings] Starting page load...');
    const user = await getCurrentUser();
    console.log('[HOD Settings] User loaded:', { userId: user?.id, role: user?.role });
    if (!user || user.role !== "TEACHER") redirect("/login");

    console.log('[HOD Settings] Resolving actor...');
    const actor = await resolveAssessmentActor(user, user.schoolId!);
    console.log('[HOD Settings] Actor resolved:', { hasHOD: actor.roles.some(r => r.role === "HOD"), teacherId: actor.teacher?.id });

  const hasAssessmentHOD = actor.roles.some((r) => r.role === "HOD");
  const isWide = actor.isPrincipal || actor.roles.some((r) =>
    ["DIRECTOR", "EXAM_OFFICER"].includes(r.role)
  );

  // ── Resolve the HOD's department ─────────────────────────────────────────
  // Check both the assessment-role HOD and the HR/timetable HOD
  // (Department.headTeacherId) so that a teacher set as department head
  // via People → Departments automatically gets access here, matching
  // the same check used in the nav layout.
  console.log('[HOD Settings] Resolving department...');
  let department: { id: string; name: string } | null = null;
  if (actor.teacher?.id) {
    // Primary check: are they explicitly the head of a department?
    console.log('[HOD Settings] Checking if teacher is department head...');
    department = await prisma.department.findFirst({
      where: { schoolId: user.schoolId!, headTeacherId: actor.teacher.id },
      select: { id: true, name: true },
    });
    console.log('[HOD Settings] Department from headTeacherId:', department);
    // Fall back to primary department if not head of any but has an
    // assessment HOD role
    if (!department && hasAssessmentHOD) {
      console.log('[HOD Settings] Checking primary department as fallback...');
      const t = await prisma.teacher.findUnique({
        where: { id: actor.teacher.id },
        select: { primaryDepartmentId: true },
      });
      console.log('[HOD Settings] Teacher primary dept ID:', t?.primaryDepartmentId);
      if (t?.primaryDepartmentId) {
        department = await prisma.department.findUnique({
          where: { id: t.primaryDepartmentId },
          select: { id: true, name: true },
        });
        console.log('[HOD Settings] Department from primaryDepartmentId:', department);
      }
    }
  }

  // isDeptHead covers both the HR-level appointment and the assessment role
  const isDeptHead = !!department || hasAssessmentHOD;

  if (!isDeptHead && !isWide) {
    return (
      <div className="space-y-3 px-6 py-10">
        <h1 className="font-display text-xl font-semibold text-foreground">Settings</h1>
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-slate">
          This page is only available to Heads of Department.
        </div>
      </div>
    );
  }

  if (!department) {
    return (
      <div className="space-y-3 px-6 py-10">
        <h1 className="font-display text-xl font-semibold text-foreground">Settings</h1>
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-slate">
          No department assigned. Contact the principal to be set as Head of Department.
        </div>
      </div>
    );
  }

  // ── Subjects in this department ──────────────────────────────────────────
  console.log('[HOD Settings] Fetching subjects for department:', department.id);
  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId!, departmentId: department.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, applicableForms: true },
  });
  console.log('[HOD Settings] Found', subjects.length, 'subjects');

  // ── All 8-4-4 frameworks (active or not) for the formula dropdown ────────
  // We include inactive ones so the HOD can still manage formulas for past
  // periods even after a new framework is created for a new year.
  console.log('[HOD Settings] Fetching frameworks...');
  const frameworks = await db.assessmentFramework.findMany({
    where: { schoolId: user.schoolId!, type: "EIGHT_FOUR_FOUR" },
    orderBy: { academicYear: "desc" },
    select: {
      id: true,
      type: true,
      label: true,
      academicYear: true,
      isActive: true,
    },
  }) as Array<{ id: string; type: string; label: string; academicYear: string; isActive: boolean }>;
  console.log('[HOD Settings] Found', frameworks.length, 'frameworks');

  // ── Exam periods — formulas are saved per period ─────────────────────────
  // Periods are shared across every framework, so this is the full list.
  console.log('[HOD Settings] Fetching exam periods...');
  const periods = await db.assessmentPeriod.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ academicYear: "desc" }, { term: "asc" }, { name: "asc" }],
    select: { id: true, name: true, academicYear: true, term: true, isCurrent: true },
  }) as Array<{ id: string; name: string; academicYear: string; term: number | null; isCurrent: boolean }>;
  console.log('[HOD Settings] Found', periods.length, 'periods');

  // ── Existing formula configs for this department ─────────────────────────
  // Wrapped in try/catch: the DepartmentFormulaConfig table may not exist yet
  // if the database migration hasn't been applied (prisma db push pending).
  console.log('[HOD Settings] Fetching existing formulas...');
  let existingFormulas: Array<{
    id: string;
    subjectId: string;
    form: number;
    periodId: string;
    formula: string;
    updatedAt: string;
  }> = [];
  try {
    existingFormulas = await db.departmentFormulaConfig.findMany({
      where: { schoolId: user.schoolId!, departmentId: department.id },
      select: {
        id: true,
        subjectId: true,
        form: true,
        periodId: true,
        formula: true,
        updatedAt: true,
      },
    });
    console.log('[HOD Settings] Found', existingFormulas.length, 'existing formulas');
  } catch (err) {
    console.log('[HOD Settings] Formula table query failed (table may not exist):', err);
    // Table doesn't exist yet — page still renders, formulas just start empty
  }

  // ── Distinct class LEVELS registered at this school ─────────────────────
  // A formula belongs to a whole level (every Form 3 stream shares one), so we
  // label rows with the canonical stage name ("Form 3", "Grade 10") and never
  // with a stream's class name ("Form 3 East").
  console.log('[HOD Settings] Fetching school class forms...');
  const schoolClassForms = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    select: { form: true, stageName: true, frameworkType: true },
    orderBy: [{ form: "asc" }, { name: "asc" }],
  });
  console.log('[HOD Settings] Found', schoolClassForms.length, 'class forms');

  console.log('[HOD Settings] Deduplicating levels...');
  const schoolForms: number[] = [];
  const schoolFormLabels: Record<number, string> = {};
  for (const c of schoolClassForms) {
    if (c.form in schoolFormLabels) continue;
    schoolForms.push(c.form);
    // stageName is the canonical, stream-free level name. Legacy rows without
    // one fall back to the framework's own naming.
    schoolFormLabels[c.form] =
      c.stageName?.trim() ||
      (c.frameworkType === "CBE" ? `Grade ${c.form}` : `Form ${c.form}`);
  }
  console.log('[HOD Settings] Unique levels:', schoolForms);

  console.log('[HOD Settings] Page data loaded successfully, rendering...');
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">
          Department Settings
        </h1>
        <p className="text-sm text-slate mt-0.5">
          Configure mark calculation formulas for each subject and class level in{" "}
          <span className="font-medium text-foreground">{department.name}</span>.
        </p>
      </div>

      <HODFormulaSettings
        department={department}
        subjects={subjects}
        frameworks={frameworks}
        periods={periods}
        initialFormulas={existingFormulas}
        schoolForms={schoolForms}
        schoolFormLabels={schoolFormLabels}
      />
    </div>
  );
  } catch (error) {
    console.error('[HOD Settings Page Error]:', error);
    throw error; // Re-throw so the error boundary can catch it
  }
}
