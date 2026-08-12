import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .transform((s) => s.toUpperCase())
    .optional(),
  type: z.enum(["CORE", "ELECTIVE"]).optional(),
  departmentId: z.string().min(1).optional(),
  applicableForms: z.array(z.number().int().min(1).max(6)).min(1).optional(),
  lessonsPerWeek: z.number().int().min(1).max(20).optional(),
  doubleLesson: z.boolean().optional(),
  requiresSpecialRoom: z.string().trim().optional().or(z.literal("")),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("SUBJECTS", "edit"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const existing = await prisma.subject.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Subject not found." }, { status: 404 });

  if (parsed.data.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: parsed.data.departmentId, schoolId: user.schoolId },
    });
    if (!department) {
      return NextResponse.json({ error: "Choose a valid department." }, { status: 400 });
    }
  }

  try {
    const subject = await prisma.subject.update({
      where: { id: params.id },
      data: {
        ...parsed.data,
        requiresSpecialRoom:
          parsed.data.requiresSpecialRoom === "" ? null : parsed.data.requiresSpecialRoom,
      },
    });
    return NextResponse.json(subject);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A subject with that code already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't update subject." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("SUBJECTS", "delete"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.subject.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Subject not found." }, { status: 404 });

  try {
    await prisma.subject.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "This subject is still assigned to teachers, timetable slots, or students. Remove those first.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't delete subject." }, { status: 500 });
  }
}
