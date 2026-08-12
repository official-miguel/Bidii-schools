import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole , requireSchoolRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const classId = req.nextUrl.searchParams.get("classId");
  if (!classId) {
    return NextResponse.json({ error: "classId is required." }, { status: 400 });
  }

  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId },
  });
  if (!schoolClass) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const slots = await prisma.timetableSlot.findMany({
    where: { classId },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  });
  return NextResponse.json(slots);
}

const createSchema = z.object({
  classId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(4),
  period: z.number().int().min(1).max(12),
  subjectId: z.string().min(1, "Choose a subject."),
  teacherId: z.string().min(1, "Choose a teacher."),
  room: z.string().trim().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: data.classId, schoolId },
  });
  if (!schoolClass) return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });

  // Guard rail from Section 2C.1: only let a teacher be picked for a subject
  // they're actually assigned to teach, and only within this school.
  const assignment = await prisma.teacherSubject.findFirst({
    where: {
      teacherId: data.teacherId,
      subjectId: data.subjectId,
      teacher: { schoolId },
      subject: { schoolId },
    },
  });
  if (!assignment) {
    return NextResponse.json(
      { error: "That teacher isn't assigned to teach this subject." },
      { status: 400 }
    );
  }

  // The teacher of a subject for a class is a standing assignment, not a
  // per-lesson choice — once set, it stays until explicitly changed (see
  // ClassSubjectTeacher). The first lesson added for a (class, subject)
  // establishes it; every lesson after that must use the same teacher, so
  // a class never ends up with two different Maths teachers by accident.
  const pinned = await prisma.classSubjectTeacher.findUnique({
    where: { classId_subjectId: { classId: data.classId, subjectId: data.subjectId } },
  });
  if (pinned && pinned.teacherId !== data.teacherId) {
    return NextResponse.json(
      {
        error:
          "This class's teacher for this subject is already set to someone else. Change the subject teacher first if you want to switch them — every lesson for this subject will move with them.",
      },
      { status: 409 }
    );
  }

  try {
    const slot = await prisma.timetableSlot.create({
      data: { ...data, schoolId, room: data.room || null },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, fullName: true } },
      },
    });
    if (!pinned) {
      await prisma.classSubjectTeacher.upsert({
        where: { classId_subjectId: { classId: data.classId, subjectId: data.subjectId } },
        update: { teacherId: data.teacherId },
        create: { classId: data.classId, subjectId: data.subjectId, teacherId: data.teacherId },
      });
    }
    return NextResponse.json(slot, { status: 201 });
  } catch (e) {
    const err = e as { code?: string; meta?: { target?: unknown } };
    if (err.code === "P2002") {
      const target = (err.meta?.target as string) || "";
      if (target.includes("teacher")) {
        const clash = await prisma.timetableSlot.findFirst({
          where: { teacherId: data.teacherId, dayOfWeek: data.dayOfWeek, period: data.period },
          include: { schoolClass: { select: { name: true } } },
        });
        return NextResponse.json(
          {
            error: clash
              ? `This teacher is already teaching ${clash.schoolClass.name} at that time.`
              : "This teacher is already scheduled at that time.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "This class already has a subject scheduled in that slot." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't create timetable slot." }, { status: 500 });
  }
}
