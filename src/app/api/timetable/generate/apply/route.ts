import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";

const schema = z.object({
  slots: z
    .array(
      z.object({
        classId: z.string().min(1),
        dayOfWeek: z.number().int().min(0).max(4),
        period: z.number().int().min(1),
        subjectId: z.string().min(1),
        teacherId: z.string().min(1),
        room: z.string().nullable().optional(),
      })
    )
    .min(1, "Nothing to save â€” generate a draft first."),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { slots } = parsed.data;

  const classIds = [...new Set(slots.map((s) => s.classId))];
  const subjectIds = [...new Set(slots.map((s) => s.subjectId))];
  const teacherIds = [...new Set(slots.map((s) => s.teacherId))];

  // Re-verify every id in this draft still belongs to the school and still
  // exists â€” time may have passed since the draft was generated (a class or
  // subject could have been deleted in the meantime), and the client's JSON
  // is not trusted just because it round-tripped through /generate.
  const [classCount, subjectCount, teacherCount] = await Promise.all([
    prisma.schoolClass.count({ where: { id: { in: classIds }, schoolId } }),
    prisma.subject.count({ where: { id: { in: subjectIds }, schoolId } }),
    prisma.teacher.count({ where: { id: { in: teacherIds }, schoolId } }),
  ]);
  if (classCount !== classIds.length || subjectCount !== subjectIds.length || teacherCount !== teacherIds.length) {
    return NextResponse.json(
      { error: "This draft refers to a class, subject, or teacher that no longer exists. Generate a new draft." },
      { status: 409 }
    );
  }

  // Every teacher must actually be assigned to teach the subject they've
  // been drafted for â€” the generator only ever picks eligible teachers, but
  // this is re-checked here too rather than trusted from the request body.
  const assignments = await prisma.teacherSubject.findMany({
    where: { teacherId: { in: teacherIds }, subjectId: { in: subjectIds } },
  });
  const assignmentSet = new Set(assignments.map((a) => `${a.teacherId}-${a.subjectId}`));
  const invalid = slots.find((s) => !assignmentSet.has(`${s.teacherId}-${s.subjectId}`));
  if (invalid) {
    return NextResponse.json(
      { error: "One of these lessons has a teacher not assigned to that subject. Generate a new draft." },
      { status: 409 }
    );
  }

  // One row per (class, subject) pair used in this draft â€” this is what
  // makes the teacher "stick" as that class's subject teacher going
  // forward, for both future regenerations and the manual builder, instead
  // of only being true for this one generated grid.
  const pairs = new Map<string, { classId: string; subjectId: string; teacherId: string }>();
  for (const s of slots) {
    pairs.set(`${s.classId}-${s.subjectId}`, { classId: s.classId, subjectId: s.subjectId, teacherId: s.teacherId });
  }

  try {
    await prisma.$transaction([
      // Only the classes actually in this draft have their timetable
      // replaced â€” everyone else's is left exactly as it was.
      prisma.timetableSlot.deleteMany({ where: { classId: { in: classIds }, schoolId } }),
      prisma.timetableSlot.createMany({
        data: slots.map((s) => ({ ...s, schoolId })),
      }),
      ...[...pairs.values()].map((p) =>
        prisma.classSubjectTeacher.upsert({
          where: { classId_subjectId: { classId: p.classId, subjectId: p.subjectId } },
          update: { teacherId: p.teacherId },
          create: p,
        })
      ),
    ]);
    return NextResponse.json({ ok: true, classesUpdated: classIds.length, slotsCreated: slots.length });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      // The DB's own unique constraints (class_slot / teacher_slot) are the
      // final safety net â€” if anything changed between generating this
      // draft and saving it (e.g. another class's timetable was edited in
      // the meantime and now clashes), the whole save is rejected atomically
      // rather than partially applied.
      return NextResponse.json(
        {
          error:
            "This draft now conflicts with an existing booking (something else changed the timetable in the meantime). Generate a fresh draft and try again.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't save the timetable." }, { status: 500 });
  }
}

