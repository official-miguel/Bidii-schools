import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * GET /api/assessments/department-formulas/for-marksheet
 *
 * Lightweight endpoint called by MarksheetGrid on load.
 * Returns the HOD-set formula that governs a given (subjectId, form, periodId).
 * Any authenticated user who can view a marksheet may call this.
 *
 * Resolution order (first match wins):
 *   1. The formula set for this exact class level in this exam period.
 *   2. The subject-wide formula (form = 0) for this exam period.
 *   3. None — the teacher's own marksheet formula applies.
 *
 * `form` is the class LEVEL, so every stream at that level resolves to the
 * same formula.
 *
 * Query params: subjectId, form (int), periodId
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ formula: null, scope: null });

  const params = req.nextUrl.searchParams;
  const subjectId = params.get("subjectId");
  const form      = parseInt(params.get("form") ?? "", 10);
  const periodId  = params.get("periodId");

  if (!subjectId || isNaN(form) || !periodId) {
    return NextResponse.json({ formula: null, scope: null });
  }

  // Find the subject's department first
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId: user.schoolId! },
    select: { departmentId: true },
  });

  if (!subject?.departmentId) return NextResponse.json({ formula: null, scope: null });

  try {
    // Fetch both the level-specific row and the subject-wide row in one query,
    // then prefer the level-specific one.
    const configs = await db.departmentFormulaConfig.findMany({
      where: {
        schoolId: user.schoolId!,
        departmentId: subject.departmentId,
        subjectId,
        periodId,
        form: { in: [form, 0] },
      },
      select: { form: true, formula: true },
    });

    const exact = configs.find(
      (c: { form: number; formula: string }) => c.form === form && c.formula.trim() !== ""
    );
    const wide = configs.find(
      (c: { form: number; formula: string }) => c.form === 0 && c.formula.trim() !== ""
    );
    const match = exact ?? wide;

    return NextResponse.json({
      formula: match?.formula ?? null,
      scope: match ? (match.form === 0 ? "SUBJECT" : "LEVEL") : null,
    });
  } catch {
    // Table doesn't exist yet — migration pending
    return NextResponse.json({ formula: null, scope: null });
  }
}
