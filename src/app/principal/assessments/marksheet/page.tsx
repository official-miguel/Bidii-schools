import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import MarksheetGrid from "@/components/assessment/MarksheetGrid";
import CbeJuniorGrid from "@/components/assessment/CbeJuniorGrid";
import CbePathwayGrid from "@/components/assessment/CbePathwayGrid";
import DoneBar from "@/components/assessment/DoneBar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function MarksheetPage({
  searchParams,
}: {
  searchParams: { periodId?: string; classId?: string; subjectId?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  // Resolve current period id for DoneBar.
  const currentPeriod = await db.assessmentPeriod.findFirst({
    where: { schoolId: user.schoolId!, isCurrent: true },
    select: { id: true },
  }) as { id: string } | null;
  const currentPeriodId = searchParams.periodId ?? currentPeriod?.id ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const classes = await (prisma as any).schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  }) as Array<{ id: string; name: string; form: number; frameworkType: string }>;

  const defaultClassId = searchParams.classId ?? classes[0]?.id ?? "";
  const selectedClass  = classes.find((c) => c.id === defaultClassId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const framework      = (selectedClass as any)?.frameworkType ?? "EIGHT_FOUR_FOUR";

  // ---- CBE routing ----
  if (framework === "CBE") {
    // Detect sub-type: learning areas (junior) vs competency units (senior pathway).
    const cbeFramework = await db.assessmentFramework.findFirst({
      where: { schoolId: user.schoolId!, type: "CBE", isActive: true },
      select: { id: true },
    }) as { id: string } | null;

    const hasLearningAreas = cbeFramework
      ? (await db.learningArea.count({ where: { schoolId: user.schoolId!, frameworkId: cbeFramework.id } })) > 0
      : false;

    const cbeClasses = classes.map((c) => ({ id: c.id, name: c.name }));

    return (
      <div>
        <PageHeader
          title="Marksheet"
          description={hasLearningAreas ? "CBE junior — performance levels by sub-strand." : "CBE pathway — SBA and exam scores."}
        />
        {hasLearningAreas ? (
          <CbeJuniorGrid
            classes={cbeClasses}
            defaultClassId={defaultClassId}
            lockClass={classes.length === 1}
            readOnly={false}
          />
        ) : (
          <CbePathwayGrid
            classes={cbeClasses}
            defaultClassId={defaultClassId}
            lockClass={classes.length === 1}
            readOnly={false}
          />
        )}
      </div>
    );
  }

  // ---- 8-4-4 routing (default) ----
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
      <MarksheetGrid
        classes={classes.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
        subjects={subjects}
        defaultClassId={defaultClassId}
        defaultSubjectId={defaultSubjectId}
        readOnly={false}
        canManagePapers={true}
      />
      {currentPeriodId && defaultClassId && (
        <DoneBar role="principal" classId={defaultClassId} periodId={currentPeriodId} />
      )}
      {currentPeriodId && defaultClassId && <div className="h-20" />}
    </div>
  );
}
