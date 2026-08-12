import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// GET /api/assessments/papers?subjectId=&frameworkId=
// Returns all papers for a given subject + framework. Accessible to anyone
// who can view a marksheet (teachers, principals, admin staff).
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subjectId   = searchParams.get("subjectId");
  const frameworkId = searchParams.get("frameworkId");

  if (!subjectId || !frameworkId) {
    return NextResponse.json(
      { error: "subjectId and frameworkId are required." },
      { status: 400 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the framework belongs to this school.
  const framework = await db.assessmentFramework.findFirst({
    where: { id: frameworkId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!framework) {
    return NextResponse.json({ error: "Framework not found." }, { status: 404 });
  }

  const papers = await db.paper.findMany({
    where: { subjectId, frameworkId, schoolId: user.schoolId! },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, maxMarks: true, sortOrder: true },
  });

  return NextResponse.json({ papers });
}

// ---------------------------------------------------------------------------
// POST /api/assessments/papers
// Creates a new paper for a subject / framework.
// Body: { subjectId, frameworkId, name, maxMarks }
// Auth: Principal or any role with ASSESSMENT_FRAMEWORK manage permission.
// ---------------------------------------------------------------------------

const createSchema = z.object({
  subjectId:   z.string().min(1),
  frameworkId: z.string().min(1),
  name:        z.string().min(1).max(80),
  maxMarks:    z.number().int().min(1).max(9999),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);

  // Only principal or HOD / Exam Officer may add papers.
  const canManage =
    actor.isPrincipal ||
    actor.roles.some((r) =>
      ["HOD", "EXAM_OFFICER", "DIRECTOR"].includes(r.role)
    );
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { subjectId, frameworkId, name, maxMarks } = parsed.data;

  // Verify framework belongs to this school.
  const framework = await db.assessmentFramework.findFirst({
    where: { id: frameworkId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!framework) {
    return NextResponse.json({ error: "Framework not found." }, { status: 404 });
  }

  // Verify subject belongs to this school.
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!subject) {
    return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  }

  // Determine next sortOrder.
  const lastPaper = await db.paper.findFirst({
    where: { subjectId, frameworkId, schoolId: user.schoolId! },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (lastPaper?.sortOrder ?? -1) + 1;

  const paper = await db.paper.create({
    data: {
      schoolId: user.schoolId!,
      frameworkId,
      subjectId,
      name: name.trim(),
      maxMarks,
      sortOrder,
    },
    select: { id: true, name: true, maxMarks: true, sortOrder: true },
  });

  return NextResponse.json({ paper }, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH /api/assessments/papers?paperId=
// Updates name and/or maxMarks for an existing paper.
// Body: { name?, maxMarks? }
// Auth: Principal / HOD / ExamOfficer — same guard as POST.
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  name:     z.string().min(1).max(80).optional(),
  maxMarks: z.number().int().min(1).max(9999).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  const canManage =
    actor.isPrincipal ||
    actor.roles.some((r) => ["HOD", "EXAM_OFFICER", "DIRECTOR"].includes(r.role));
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const paperId = searchParams.get("paperId");
  if (!paperId) {
    return NextResponse.json({ error: "paperId is required." }, { status: 400 });
  }

  const paper = await db.paper.findFirst({
    where: { id: paperId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!paper) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (!parsed.data.name && parsed.data.maxMarks === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await db.paper.update({
    where: { id: paperId },
    data: {
      ...(parsed.data.name     !== undefined ? { name:     parsed.data.name.trim() } : {}),
      ...(parsed.data.maxMarks !== undefined ? { maxMarks: parsed.data.maxMarks   } : {}),
    },
    select: { id: true, name: true, maxMarks: true, sortOrder: true },
  });

  return NextResponse.json({ paper: updated });
}

// ---------------------------------------------------------------------------
// DELETE /api/assessments/papers?paperId=
// Removes a paper only if it has no assessment items recorded against it.
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  const canManage =
    actor.isPrincipal ||
    actor.roles.some((r) => ["HOD", "EXAM_OFFICER", "DIRECTOR"].includes(r.role));
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const paperId = searchParams.get("paperId");
  if (!paperId) {
    return NextResponse.json({ error: "paperId is required." }, { status: 400 });
  }

  const paper = await db.paper.findFirst({
    where: { id: paperId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!paper) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  const itemCount: number = await db.assessmentItem.count({ where: { paperId } });
  if (itemCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${itemCount} marks are already recorded for this paper.` },
      { status: 409 }
    );
  }

  await db.paper.delete({ where: { id: paperId } });
  return NextResponse.json({ ok: true });
}
