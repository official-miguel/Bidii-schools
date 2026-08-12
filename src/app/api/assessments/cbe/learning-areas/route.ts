import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canReadPeriods } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canReadPeriods(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find the school's active CBE framework.
  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "CBE", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  if (!framework) {
    return NextResponse.json({ frameworkId: null, learningAreas: [] });
  }

  // Fetch LearningArea → Strand → SubStrand, all ordered by sortOrder.
  const learningAreas = await db.learningArea.findMany({
    where: { schoolId: user.schoolId!, frameworkId: framework.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      applicableGrades: true,
      strands: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          sortOrder: true,
          subStrands: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, code: true, sortOrder: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ frameworkId: framework.id, learningAreas });
}
