import { prisma } from "@/lib/prisma";
import type { FrameworkType } from "@prisma/client";

/**
 * Resolves a school's active AssessmentFramework of a given type.
 *
 * AssessmentPeriod is shared across every framework (one period per term,
 * used by every class regardless of grading system) — only Paper,
 * LearningArea, CompetencyUnit, and AssessmentItem are still framework-
 * scoped. Anything that used to read `period.frameworkId` to find those now
 * resolves the framework independently, from whichever type it actually
 * needs (the class's frameworkType, or a fixed type like "CBE").
 */
export async function resolveActiveFramework(
  schoolId: string,
  type: FrameworkType
): Promise<{ id: string } | null> {
  return prisma.assessmentFramework.findFirst({
    where: { schoolId, type, isActive: true },
    select: { id: true },
  });
}
