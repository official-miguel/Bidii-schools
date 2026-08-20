import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET() {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("DEPARTMENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const departments = await prisma.department.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
    include: {
      headTeacher: { select: { id: true, fullName: true } },
      _count: { select: { subjects: true, teachers: true } },
    },
  });
  return NextResponse.json(departments);
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  headTeacherId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  try {
    const department = await prisma.department.create({
      data: {
        schoolId: user.schoolId!,
        name: parsed.data.name,
        headTeacherId: parsed.data.headTeacherId || null,
      },
    });
    return NextResponse.json(department, { status: 201 });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A department with that name already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't create department." }, { status: 500 });
  }
}

