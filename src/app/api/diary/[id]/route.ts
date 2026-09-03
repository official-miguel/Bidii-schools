import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";

// ── GET /api/diary/[id] ───────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findUnique({
    where:  { userId: user.id },
    select: { id: true },
  });
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const entry = await prisma.diaryEntry.findFirst({
    where: {
      id:        params.id,
      schoolId:  user.schoolId,
      teacherId: teacher.id,
      deletedAt: null,
    },
    include: {
      subject: { select: { name: true, code: true } },
      targets: {
        include: { schoolClass: { select: { id: true, name: true } } },
      },
    },
  });

  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(entry);
}

// ── PATCH /api/diary/[id] — Edit title, description, dueDate ─────────────────

const patchSchema = z.object({
  title:       z.string().trim().min(1, "Title cannot be empty.").max(255).optional(),
  description: z.string().trim().optional().nullable(),
  dueDate:     z.string().datetime({ offset: true }).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const teacher = await prisma.teacher.findUnique({
    where:  { userId: user.id },
    select: { id: true },
  });
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const entry = await prisma.diaryEntry.findFirst({
    where: {
      id:        params.id,
      schoolId:  user.schoolId,
      teacherId: teacher.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.data.title       !== undefined) data.title       = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.dueDate     !== undefined) {
    data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  }

  const updated = await prisma.diaryEntry.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}

// ── DELETE /api/diary/[id] — Soft delete ─────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findUnique({
    where:  { userId: user.id },
    select: { id: true },
  });
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const entry = await prisma.diaryEntry.findFirst({
    where: {
      id:        params.id,
      schoolId:  user.schoolId,
      teacherId: teacher.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.diaryEntry.update({
    where: { id: params.id },
    data:  { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
