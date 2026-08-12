import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import PathwayWeightsForm from "./PathwayWeightsForm";
import { DEFAULT_PATHWAY_WEIGHT } from "@/lib/assessment/gradingCbe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export default async function PathwayWeightsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "CBE", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  if (!framework) {
    return (
      <div>
        <PageHeader
          title="Pathway Weights"
          description="Configure SBA and exam weighting for senior CBE pathway subjects."
        />
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
          No active CBE framework found. Create one before configuring pathway weights.
        </div>
      </div>
    );
  }

  // Subjects applicable to CBE classes (forms 1–4).
  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  // Existing weights.
  const existing: Array<{
    subjectId: string; sbaWeight: number; examWeight: number;
    sbaMaxMarks: number; examMaxMarks: number;
  }> = await db.pathwayWeight.findMany({
    where: { frameworkId: framework.id, schoolId: user.schoolId! },
    select: { subjectId: true, sbaWeight: true, examWeight: true, sbaMaxMarks: true, examMaxMarks: true },
  });
  const weightMap = new Map(existing.map((w) => [w.subjectId, w]));

  const initialWeights = subjects.map((s) => {
    const w = weightMap.get(s.id);
    return {
      subject:      s,
      sbaWeight:    w?.sbaWeight    ?? DEFAULT_PATHWAY_WEIGHT.sbaWeight,
      examWeight:   w?.examWeight   ?? DEFAULT_PATHWAY_WEIGHT.examWeight,
      sbaMaxMarks:  w?.sbaMaxMarks  ?? DEFAULT_PATHWAY_WEIGHT.sbaMaxMarks,
      examMaxMarks: w?.examMaxMarks ?? DEFAULT_PATHWAY_WEIGHT.examMaxMarks,
      isDefault:    !w,
    };
  });

  return (
    <div>
      <PageHeader
        title="Pathway Weights"
        description="Set the SBA-to-exam weighting split for each subject in the senior CBE pathway. Weights must sum to 100% per subject."
      />
      <PathwayWeightsForm initialWeights={initialWeights} />
    </div>
  );
}
