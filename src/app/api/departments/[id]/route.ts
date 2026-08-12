import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  headTeacherId: z.string().nullable().optional(),
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

  const existing = await prisma.department.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!existing) return NextResponse.json({ error: "Department not found." }, { status: 404 });

  try {
    const department = await prisma.department.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return NextResponse.json(department);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A department with that name already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't update department." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.department.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!existing) return NextResponse.json({ error: "Department not found." }, { status: 404 });

  try {
    await prisma.department.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "This department still has subjects or staff linked to it. Reassign them first.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't delete department." }, { status: 500 });
  }
}
