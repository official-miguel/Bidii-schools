import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import MarksheetWithSaveBar from "@/components/assessment/MarksheetWithSaveBar";
import CbeJuniorGrid from "@/components/assessment/CbeJuniorGrid";
import { CLASS_LABEL_SELECT, type ClassOption } from "@/lib/curriculum/classLabels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function MarksheetPage({
  searchParams,
}: {
  searchParams: { periodId?: string; classId?: string; subjectId?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  // Load all classes first so we can determine the selected class's framework.
  const classes = await (prisma as any).schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { ...CLASS_LABEL_SELECT },
  }) as ClassOption[];

  const defaultClassId = searchParams.classId ?? classes[0]?.id ?? "";
  const selectedClass  = classes.find((c) => c.id === defaultClassId);
  const framework      = (selectedClass?.frameworkType ?? "EIGHT_FOUR_FOUR") as string;

  // The class's active framework — still needed to scope Papers/LearningAreas.
  const classFramework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: framework, isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  // Periods are shared across every framework now.
  const currentPeriod = await db.assessmentPeriod.findFirst({
    where: { schoolId: user.schoolId!, isCurrent: true },
    select: { id: true },
  }) as { id: string } | null;

  const currentPeriodId = searchParams.periodId ?? currentPeriod?.id ?? "";

  // ---- CBE Junior routing — performance levels, not papers ----
  // Senior CBE ("Pathway") now shares the same paper-based entry as 8-4-4
  // below, graded on the CBE scale instead of KCSE — see MarksheetGrid's
  // gradingFramework prop.
  if (framework === "CBE") {
    const hasLearningAreas = classFramework
      ? (await db.learningArea.count({ where: { schoolId: user.schoolId!, frameworkId: classFramework.id } })) > 0
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
            readOnly={false}
          />
        </div>
      );
    }
    // No learning areas configured — fall through to the shared paper-based
    // path below.
  }

  // ---- Paper-based routing — 8-4-4 and CBE Pathway (senior) share this ----
  // Pass all subjects — ExamFilterBar filters by applicableForms internally.
  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId! },
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
        readOnly={false}
        canManagePapers={true}
        gradingFramework={framework === "CBE" ? "CBE" : "EIGHT_FOUR_FOUR"}
        summaryHref={
          currentPeriodId && defaultClassId
            ? `/principal/assessments/dashboard?${new URLSearchParams({ classId: defaultClassId, periodId: currentPeriodId }).toString()}`
            : undefined
        }
      />
    </div>
  );
}
