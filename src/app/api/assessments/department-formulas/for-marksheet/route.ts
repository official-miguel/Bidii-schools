import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * GET /api/assessments/department-formulas/for-marksheet
 *
 * Lightweight public-ish endpoint called by MarksheetGrid on load.
 * Returns the saved department formula for a given (subjectId, form, frameworkId).
 * Any authenticated user who can view a marksheet may call this.
 *
 * Query params: subjectId, form (int), frameworkId
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ formula: null });

  const params = req.nextUrl.searchParams;
  const subjectId   = params.get("subjectId");
  const form        = parseInt(params.get("form") ?? "", 10);
  const frameworkId = params.get("frameworkId");

  if (!subjectId || isNaN(form) || !frameworkId) {
    return NextResponse.json({ formula: null });
  }

  // Find the subject's department first
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId: user.schoolId },
    select: { departmentId: true },
  });

  if (!subject?.departmentId) return NextResponse.json({ formula: null });

  try {
    const config = await db.departmentFormulaConfig.findFirst({
      where: {
        schoolId:     user.schoolId,
        departmentId: subject.departmentId,
        subjectId,
        form,
        frameworkId,
      },
      select: { formula: true },
    });
    return NextResponse.json({ formula: config?.formula ?? null });
  } catch {
    // Table doesn't exist yet — migration pending
    return NextResponse.json({ formula: null });
  }
}
