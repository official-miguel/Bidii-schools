import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the department this HOD heads. Returns null if not an HOD. */
async function resolveHODDepartment(teacherId: string, schoolId: string) {
  return prisma.department.findFirst({
    where: { schoolId, headTeacherId: teacherId },
    select: { id: true, name: true },
  });
}

/** Guard: must be HOD, DIRECTOR, EXAM_OFFICER, or PRINCIPAL. */
function canManageFormulas(actor: Awaited<ReturnType<typeof resolveAssessmentActor>>) {
  return (
    actor.isPrincipal ||
    actor.roles.some((r) => ["HOD", "DIRECTOR", "EXAM_OFFICER"].includes(r.role))
  );
}

// ---------------------------------------------------------------------------
// GET /api/assessments/department-formulas
// Returns all formula configs for the HOD's department.
// Query params: departmentId (optional override for wide-access users)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId);
  if (!canManageFormulas(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Determine which department to scope to
  let departmentId = req.nextUrl.searchParams.get("departmentId");
  if (!departmentId && actor.teacher?.id) {
    const dept = await resolveHODDepartment(actor.teacher.id, user.schoolId);
    departmentId = dept?.id ?? null;
  }

  if (!departmentId) {
    return NextResponse.json({ formulas: [] });
  }

  const formulas = await db.departmentFormulaConfig.findMany({
    where: { schoolId: user.schoolId, departmentId },
    orderBy: [{ subjectId: "asc" }, { form: "asc" }],
    select: {
      id: true,
      subjectId: true,
      form: true,
      frameworkId: true,
      formula: true,
      updatedAt: true,
      subject: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json({ formulas });
}

// ---------------------------------------------------------------------------
// PUT /api/assessments/department-formulas
// Upserts a formula config for one (departmentId, subjectId, form, frameworkId).
// Body: { departmentId, subjectId, form, frameworkId, formula }
// ---------------------------------------------------------------------------

const upsertSchema = z.object({
  departmentId: z.string().min(1),
  subjectId:    z.string().min(1),
  form:         z.number().int().min(1).max(13),
  frameworkId:  z.string().min(1),
  formula:      z.string().max(2000),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId);
  if (!canManageFormulas(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { departmentId, subjectId, form, frameworkId, formula } = parsed.data;

  // HOD can only manage their own department
  const isHod = actor.roles.some((r) => r.role === "HOD");
  if (isHod && actor.teacher?.id) {
    const hodDept = await resolveHODDepartment(actor.teacher.id, user.schoolId);
    if (hodDept?.id !== departmentId) {
      return NextResponse.json({ error: "Forbidden — not your department." }, { status: 403 });
    }
  }

  // Verify subject belongs to this department
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId: user.schoolId, departmentId },
    select: { id: true },
  });
  if (!subject) {
    return NextResponse.json(
      { error: "Subject not found in this department." },
      { status: 404 }
    );
  }

  // Verify framework belongs to this school
  const framework = await db.assessmentFramework.findFirst({
    where: { id: frameworkId, schoolId: user.schoolId },
    select: { id: true },
  });
  if (!framework) {
    return NextResponse.json({ error: "Framework not found." }, { status: 404 });
  }

  const config = await db.departmentFormulaConfig.upsert({
    where: {
      departmentId_subjectId_form_frameworkId: {
        departmentId,
        subjectId,
        form,
        frameworkId,
      },
    },
    create: {
      schoolId: user.schoolId,
      departmentId,
      subjectId,
      form,
      frameworkId,
      formula: formula.trim(),
    },
    update: {
      formula: formula.trim(),
    },
    select: {
      id: true,
      subjectId: true,
      form: true,
      frameworkId: true,
      formula: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ config });
}

// ---------------------------------------------------------------------------
// DELETE /api/assessments/department-formulas?id=
// Removes a specific formula config by its id.
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId);
  if (!canManageFormulas(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const existing = await db.departmentFormulaConfig.findFirst({
    where: { id, schoolId: user.schoolId },
    select: { id: true, departmentId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Formula config not found." }, { status: 404 });
  }

  // HOD can only delete from their own dept
  const isHod = actor.roles.some((r) => r.role === "HOD");
  if (isHod && actor.teacher?.id) {
    const hodDept = await resolveHODDepartment(actor.teacher.id, user.schoolId);
    if (hodDept?.id !== existing.departmentId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  await db.departmentFormulaConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
