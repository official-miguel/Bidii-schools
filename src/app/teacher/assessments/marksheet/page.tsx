import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MarksheetWithSaveBar from "@/components/assessment/MarksheetWithSaveBar";
import CbeJuniorGrid from "@/components/assessment/CbeJuniorGrid";
import { resolveAssessmentActor, canEnterMarks, canViewMarksheet } from "@/lib/assessment/auth844";
import MarksheetPageClient from "@/components/assessment/MarksheetPageClient";
import { CLASS_LABEL_SELECT, type ClassOption } from "@/lib/curriculum/classLabels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function TeacherMarksheetPage({
  searchParams,
}: {
  searchParams: { classId?: string; subjectId?: string; periodId?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const schoolId = user.schoolId!;
  const actor = await resolveAssessmentActor(user, schoolId);
  const classTeacherOfId = actor.classTeacherOfId;

  // Periods are loaded later, after we know the selected class's frameworkType.
  // Defined here so TypeScript has the type available throughout the function.
  type PeriodOption = {
    id: string; name: string; academicYear: string;
    term: number | null; isCurrent: boolean;
  };

  /**
   * All exam periods for the school. Periods are shared across every
   * framework now (one "Term 3 Opener 2026" used by 8-4-4 and CBE classes
   * alike), so there's nothing left to filter by framework type — the
   * `fwType` param is kept only so every call site below reads the same as
   * before.
   */
  async function periodsForFramework(_fwType: string): Promise<PeriodOption[]> {
    return db.assessmentPeriod.findMany({
      where: { schoolId },
      orderBy: [{ academicYear: "desc" }, { term: "desc" }],
      select: { id: true, name: true, academicYear: true, term: true, isCurrent: true },
    });
  }

  // ── Determine mode ────────────────────────────────────────────────────────
  // Landing mode: no classId or no subjectId — show the cards grid.
  const isGridMode = !!(searchParams.classId && searchParams.subjectId);

  if (!isGridMode) {
    // Landing — render the card grid via MarksheetPageClient.
    // Periods are shared across every framework, so one fetch covers every
    // class the teacher can see, regardless of framework mix.
    const allPeriods = await periodsForFramework("EIGHT_FOUR_FOUR");
    const currentPeriod = allPeriods.find((p) => p.isCurrent) ?? allPeriods[0] ?? null;
    const activePeriodId = searchParams.periodId ?? currentPeriod?.id ?? "";

    // ── HOD detection: resolve department name for the tab label ────────────
    const isHOD = actor.roles.some((r) => r.role === "HOD");
    let hodDepartmentName: string | undefined;
    if (isHOD && actor.teacher?.id) {
      const hodDept = await prisma.department.findFirst({
        where: { schoolId, headTeacherId: actor.teacher.id },
        select: { name: true },
      });
      if (hodDept) {
        hodDepartmentName = hodDept.name;
      } else {
        // Fall back to primary department
        const teacherRow = await prisma.teacher.findUnique({
          where: { id: actor.teacher.id },
          select: { primaryDepartment: { select: { name: true } } },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hodDepartmentName = (teacherRow as any)?.primaryDepartment?.name;
      }
    }

    return (
      <MarksheetPageClient
        periods={allPeriods}
        activePeriodId={activePeriodId}
        isGridMode={false}
        isHOD={isHOD}
        departmentName={hodDepartmentName}
      >
        {/* children unused in landing mode */}
        <></>
      </MarksheetPageClient>
    );
  }

  // ── Grid mode — resolve teacher's subject access ──────────────────────────
  let deptSubjectIds: Set<string> = new Set();
  if (actor.teacher?.id) {
    const teacherRow = await prisma.teacher.findUnique({
      where: { id: actor.teacher.id },
      select: { primaryDepartmentId: true },
    });
    if (teacherRow?.primaryDepartmentId) {
      const deptSubjects = await prisma.subject.findMany({
        where: { schoolId, departmentId: teacherRow.primaryDepartmentId },
        select: { id: true },
      });
      deptSubjectIds = new Set(deptSubjects.map((s) => s.id));
    }
  }

  // ── Resolve classes ───────────────────────────────────────────────────────
  const allClasses = await db.schoolClass.findMany({
    where: { schoolId },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { ...CLASS_LABEL_SELECT },
  }) as ClassOption[];

  const assignedClassIds = actor.teacher?.id
    ? new Set(
        (await prisma.classSubjectTeacher.findMany({
          where: { teacherId: actor.teacher.id },
          select: { classId: true },
        })).map((r) => r.classId)
      )
    : new Set<string>();

  if (classTeacherOfId) assignedClassIds.add(classTeacherOfId);

  const ownClass      = allClasses.filter((c) => c.id === classTeacherOfId);
  const otherAssigned = allClasses.filter(
    (c) => c.id !== classTeacherOfId && assignedClassIds.has(c.id)
  );
  const isWideAccess  = actor.isPrincipal ||
    actor.teacherFullAccess ||
    actor.roles.some((r) => ["DIRECTOR", "EXAM_OFFICER"].includes(r.role));
  const otherAll      = isWideAccess
    ? allClasses.filter((c) => c.id !== classTeacherOfId && !assignedClassIds.has(c.id))
    : [];

  const classes = [...ownClass, ...otherAssigned, ...otherAll];

  if (classes.length === 0) {
    const fallbackPeriods = await periodsForFramework("EIGHT_FOUR_FOUR");
    const fallbackPeriodId = searchParams.periodId ?? fallbackPeriods.find((p) => p.isCurrent)?.id ?? fallbackPeriods[0]?.id ?? "";
    return (
      <MarksheetPageClient periods={fallbackPeriods} activePeriodId={fallbackPeriodId} isGridMode={true}>
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-slate">
          You have no class assignments yet. Contact the principal to be assigned to
          classes and subjects.
        </div>
      </MarksheetPageClient>
    );
  }

  const defaultClassId = searchParams.classId ?? classes[0]?.id ?? "";
  const selectedClass  = classes.find((c) => c.id === defaultClassId) ?? classes[0];
  const frameworkType  = selectedClass?.frameworkType ?? "EIGHT_FOUR_FOUR";

  // Load periods scoped to this class's framework.
  const allPeriods = await periodsForFramework(frameworkType);
  const currentPeriod = allPeriods.find((p) => p.isCurrent) ?? allPeriods[0] ?? null;
  const activePeriodId = searchParams.periodId ?? currentPeriod?.id ?? "";

  // ── CBE Junior path — performance levels per learning area, not papers ────
  // This is the only framework variant with a genuinely different entry
  // model (EE/ME/AE/BE per learning area/strand, no numeric papers). Senior
  // CBE ("Pathway") now shares the exact same paper-based entry as 8-4-4
  // below — the only difference is which grading scale the grade badge uses.
  if (frameworkType === "CBE") {
    const cbeFramework = await db.assessmentFramework.findFirst({
      where: { schoolId, type: "CBE", isActive: true },
      select: { id: true },
    }) as { id: string } | null;

    const hasLearningAreas = cbeFramework
      ? (await db.learningArea.count({
          where: { schoolId, frameworkId: cbeFramework.id },
        })) > 0
      : false;

    if (hasLearningAreas) {
      const canEdit =
        actor.isPrincipal ||
        actor.teacherFullAccess ||
        (classTeacherOfId === defaultClassId &&
          actor.roles.some((r) => r.role === "CLASS_TEACHER")) ||
        actor.roles.some((r) =>
          ["SUBJECT_TEACHER", "EXAM_OFFICER", "DIRECTOR"].includes(r.role)
        ) ||
        actor.assignedSubjectIds.size > 0;

      return (
        <MarksheetPageClient periods={allPeriods} activePeriodId={activePeriodId} isGridMode={true}>
          <div className="space-y-4">
            <div>
              <h1 className="font-display text-xl font-semibold text-foreground">Mark Sheets</h1>
              <p className="text-sm text-slate mt-0.5">
                {canEdit
                  ? "CBE Junior — tap cells to record performance levels."
                  : "View-only — contact the principal to be assigned an entry role."}
              </p>
            </div>
            <CbeJuniorGrid
              classes={classes.map((c) => ({ id: c.id, name: c.name }))}
              defaultClassId={defaultClassId}
              lockClass={classes.length === 1}
              readOnly={!canEdit}
            />
          </div>
        </MarksheetPageClient>
      );
    }
    // No learning areas configured — fall through to the shared paper-based
    // path below (same code as 8-4-4, graded on the CBE scale).
  }

  // ── Paper-based path — 8-4-4 and CBE Pathway (senior) share this ─────────
  const allSubjects = await prisma.subject.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, applicableForms: true, departmentId: true },
  });

  const viewableSubjects = allSubjects.filter(
    (s) => canViewMarksheet(actor, s.id) || deptSubjectIds.has(s.id)
  );

  const defaultSubjectId = searchParams.subjectId ?? "";

  const editAllowed = defaultSubjectId
    ? canEnterMarks(actor, defaultSubjectId) || deptSubjectIds.has(defaultSubjectId)
    : false;

  const canManagePapers = editAllowed;

  if (viewableSubjects.length === 0) {
    return (
      <MarksheetPageClient periods={allPeriods} activePeriodId={activePeriodId} isGridMode={true}>
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-slate">
          You don&apos;t have access to any subject marksheets yet. Contact the principal
          to be assigned a subject role.
        </div>
      </MarksheetPageClient>
    );
  }

  return (
    <MarksheetPageClient periods={allPeriods} activePeriodId={activePeriodId} isGridMode={true}>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">
            {selectedClass?.name ?? "Mark Sheet"}
          </h1>
          <p className="text-sm text-slate mt-0.5">
            {editAllowed
              ? "Enter and update scores for your assigned subjects."
              : "View-only — you don't have edit access for this subject."}
          </p>
        </div>
        <MarksheetWithSaveBar
          classes={classes}
          subjects={viewableSubjects}
          defaultClassId={defaultClassId}
          defaultSubjectId={defaultSubjectId}
          lockClass={true}
          readOnly={!editAllowed}
          canManagePapers={canManagePapers}
          gradingFramework={frameworkType === "CBE" ? "CBE" : "EIGHT_FOUR_FOUR"}
          summaryHref={
            activePeriodId && defaultClassId
              ? `/teacher/assessments/dashboard?${new URLSearchParams({ classId: defaultClassId, periodId: activePeriodId }).toString()}`
              : undefined
          }
        />
      </div>
    </MarksheetPageClient>
  );
}
