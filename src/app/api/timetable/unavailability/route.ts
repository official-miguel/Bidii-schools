import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";

// Returns every teacher at the school alongside their unavailable slots, so
// the AI Timetable panel can render one compact grid per teacher without a
// separate request each.
export async function GET() {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      unavailability: { select: { dayOfWeek: true, period: true } },
    },
  });
  return NextResponse.json(teachers);
}

const schema = z.object({
  teacherId: z.string().min(1),
  slots: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(4), period: z.number().int().min(1) })),
});

// Replaces the full unavailability set for one teacher — simpler and less
// error-prone than diffing add/remove from the client, and the grid this
// feeds is small enough that resending the whole set each save is cheap.
export async function PUT(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const teacher = await prisma.teacher.findFirst({
    where: { id: parsed.data.teacherId, schoolId },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher not found." }, { status: 404 });

  await prisma.$transaction([
    prisma.teacherUnavailability.deleteMany({ where: { teacherId: teacher.id } }),
    prisma.teacherUnavailability.createMany({
      data: parsed.data.slots.map((s) => ({ teacherId: teacher.id, ...s })),
      skipDuplicates: true,
    }),
  ]);

  return NextResponse.json({ ok: true });
}
