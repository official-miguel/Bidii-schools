import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  form: z.number().int().min(1).optional(),
  stream: z.string().trim().optional().or(z.literal("")),
  classTeacherId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const existing = await prisma.schoolClass.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  if (parsed.data.classTeacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: parsed.data.classTeacherId, schoolId: user.schoolId },
    });
    if (!teacher) return NextResponse.json({ error: "Choose a valid teacher." }, { status: 400 });
  }

  try {
    const schoolClass = await prisma.schoolClass.update({
      where: { id: params.id },
      data: {
        ...parsed.data,
        stream: parsed.data.stream === "" ? null : parsed.data.stream,
      },
    });
    return NextResponse.json(schoolClass);
  } catch (e) {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === "P2002") {
      const field = err.meta?.target?.[0];
      return NextResponse.json(
        {
          error:
            field === "classTeacherId"
              ? "That teacher is already the class teacher of another class."
              : "A class with that name already exists.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't update class." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.schoolClass.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  try {
    await prisma.schoolClass.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: "This class still has students or timetable slots. Reassign those first." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't delete class." }, { status: 500 });
  }
}
