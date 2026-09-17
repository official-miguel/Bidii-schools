import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import MarksheetWithSaveBar from "@/components/assessment/MarksheetWithSaveBar";
import CbeJuniorGrid from "@/components/assessment/CbeJuniorGrid";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";
import { CLASS_LABEL_SELECT, type ClassOption } from "@/lib/curriculum/classLabels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * ADMIN_STAFF equivalent of /principal/assessments/marksheet. An admin holding
 * Full Admin Access gets the same unrestricted "every class, every subject"
 * view the Principal gets — adminCanManage (ASSESSMENTS canManage, granted by
 * Full Admin Access) drives write access; adminCanView alone is read-only.
 * A TEACHER routed into this portal via Full Admin Access uses the marksheet
 * at /teacher/assessments/marksheet instead — that page already checks
 * teacherFullAccess the same way.
 */
export default async function StaffMarksheetPage({
  searchParams,
}: {
  searchParams: { periodId?: string; classId?: string; subjectId?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN_STAFF" && user.role !== "BURSAR") redirect("/login");

  const schoolId = user.schoolId!;
  const actor = await resolveAssessmentActor(user, schoolId);
  if (!actor.adminCanView && !actor.adminCanManage) redirect("/staff/academics");

  const readOnly = !actor.adminCanManage;

  // Load all classes first so we can determine the selected class's framework.
  const classes = await db.schoolClass.findMany({
    where: { schoolId },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { ...CLASS_LABEL_SELECT },
  }) as ClassOption[];

  const defaultClassId = searchParams.classId ?? classes[0]?.id ?? "";
  const selectedClass  = classes.find((c) => c.id === defaultClassId);
  const framework      = (selectedClass?.frameworkType ?? "EIGHT_FOUR_FOUR") as string;

  // The class's active framework — still needed to scope Papers/LearningAreas.
  const classFramework = await db.assessmentFramework.findFirst({
    where: { schoolId, type: framework, isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  // ---- CBE Junior routing — performance levels, not papers ----
  if (framework === "CBE") {
    const hasLearningAreas = classFramework
      ? (await db.learningArea.count({ where: { schoolId, frameworkId: classFramework.id } })) > 0
      : false;

    if (hasLearningAreas) {
      const cbeClasses = classes.filter((c) => c.frameworkType === "CBE")
        .map((c) => ({ id: c.id, name: c.name }));

      return (
        <div>
          <PageHeader
            title="Marksheet"
            description="CBE junior — performance levels by sub-strand."
          />
          <CbeJuniorGrid
            classes={cbeClasses}
            defaultClassId={defaultClassId}
            lockClass={classes.length === 1}
            readOnly={readOnly}
          />
        </div>
      );
    }
    // No learning areas configured — fall through to the shared paper-based
    // path below.
  }

  // ---- Paper-based routing — 8-4-4 and CBE Pathway (senior) share this ----
  const subjects = await prisma.subject.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, applicableForms: true },
  });

  const defaultSubjectId = searchParams.subjectId ?? "";

  return (
    <div>
      <PageHeader
        title="Marksheet"
        description="Enter and review student scores per subject and period."
      />
      <MarksheetWithSaveBar
        classes={classes.filter((c) => c.frameworkType === framework)}
        subjects={subjects}
        defaultClassId={defaultClassId}
        defaultSubjectId={defaultSubjectId}
        readOnly={readOnly}
        canManagePapers={!readOnly}
        gradingFramework={framework === "CBE" ? "CBE" : "EIGHT_FOUR_FOUR"}
      />
    </div>
  );
}
