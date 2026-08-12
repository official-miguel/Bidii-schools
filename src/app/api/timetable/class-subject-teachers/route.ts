import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

/// Section: AI Timetable Generator / 2C — the standing "who teaches this
/// subject to this class" assignments (ClassSubjectTeacher). Both the
/// manual builder and the AI panel read this to pre-fill/lock the teacher
/// for a class+subject, and write to it (via PUT) when the Principal
/// explicitly changes one. Optional ?classId= narrows the list to one
/// class; omit it to get every assignment in the school (used by the AI
/// panel's "Subject teachers" table).
export async function GET(req: NextRequest) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const classId = req.nextUrl.searchParams.get("classId");

  const assignments = await prisma.classSubjectTeacher.findMany({
    where: {
      schoolClass: { schoolId: user.schoolId! },
      ...(classId ? { classId } : {}),
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  });
  return NextResponse.json(assignments);
}

const schema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
  // When a subject already has lessons on the timetable for this class
  // under a different teacher, changing the assignment here is expected to
  // move those existing lessons over to the new teacher too — that's what
  // "the teacher of that subject for that class" means. Set false to only
  // change the standing assignment without touching lessons already placed
  // (rarely needed — the UI always sends true).
  reassignExistingSlots: z.boolean().optional().default(true),
});

export async function PUT(req: NextRequest) {
  const user = (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { classId, subjectId, teacherId, reassignExistingSlots } = parsed.data;

  const [schoolClass, subject, teacherSubject] = await Promise.all([
    prisma.schoolClass.findFirst({ where: { id: classId, schoolId: user.schoolId! } }),
    prisma.subject.findFirst({ where: { id: subjectId, schoolId: user.schoolId! } }),
    prisma.teacherSubject.findFirst({
      where: { teacherId, subjectId, teacher: { schoolId: user.schoolId! } },
    }),
  ]);
  if (!schoolClass || !subject) {
    return NextResponse.json({ error: "Choose a valid class and subject." }, { status: 400 });
  }
  if (!teacherSubject) {
    return NextResponse.json(
      { error: "That teacher isn't assigned to teach this subject." },
      { status: 400 }
    );
  }

  if (reassignExistingSlots) {
    const existingSlots = await prisma.timetableSlot.findMany({
      where: { classId, subjectId },
      select: { id: true, dayOfWeek: true, period: true },
    });
    if (existingSlots.length > 0) {
      // The new teacher must actually be free in every one of this class's
      // existing lesson slots for this subject — otherwise we'd silently
      // double-book them somewhere else. Check before writing anything.
      const clash = await prisma.timetableSlot.findFirst({
        where: {
          teacherId,
          classId: { not: classId },
          OR: existingSlots.map((s) => ({ dayOfWeek: s.dayOfWeek, period: s.period })),
        },
        include: { schoolClass: { select: { name: true } } },
      });
      if (clash) {
        return NextResponse.json(
          {
            error: `Can't move these lessons to this teacher — they're already teaching ${clash.schoolClass.name} at one of those times.`,
          },
          { status: 409 }
        );
      }
    }

    await prisma.$transaction([
      prisma.classSubjectTeacher.upsert({
        where: { classId_subjectId: { classId, subjectId } },
        update: { teacherId },
        create: { classId, subjectId, teacherId },
      }),
      prisma.timetableSlot.updateMany({
        where: { classId, subjectId },
        data: { teacherId },
      }),
    ]);
  } else {
    await prisma.classSubjectTeacher.upsert({
      where: { classId_subjectId: { classId, subjectId } },
      update: { teacherId },
      create: { classId, subjectId, teacherId },
    });
  }

  const assignment = await prisma.classSubjectTeacher.findUnique({
    where: { classId_subjectId: { classId, subjectId } },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  });
  return NextResponse.json(assignment);
}
