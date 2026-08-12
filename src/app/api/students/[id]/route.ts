import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";
import { autoAssignDorm } from "@/lib/accommodation/autoAssign";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId },
    include: {
      schoolClass: { select: { id: true, name: true, form: true } },
      electives:   { include: { subject: { select: { id: true, code: true, name: true } } } },
    },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });
  return NextResponse.json(student);
}

const updateSchema = z.object({
  fullName:           z.string().trim().min(2).optional(),
  dateOfBirth:        z.string().trim().optional().or(z.literal("")),
  classId:            z.string().min(1).optional(),
  gender:             z.enum(["MALE", "FEMALE"]).nullable().optional(),
  boardingStatus:     z.enum(["DAY", "BOARDING"]).nullable().optional(),
  parentName:         z.string().trim().optional().or(z.literal("")),
  parentContact:      z.string().trim().optional().or(z.literal("")),
  photoUrl:           z.string().url().nullable().optional().or(z.literal("")),
  electiveSubjectIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // Allow PRINCIPAL unconditionally; also allow a class teacher but only for
  // students in their own class (R4.7, R4.8).
  const user = await requireSchoolRole("PRINCIPAL", "TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  // For TEACHER callers, enforce class-teacher scope.
  if (user.role === "TEACHER") {
    // Look up the student to get its classId.
    const studentForCheck = await prisma.student.findFirst({
      where: { id: params.id, schoolId },
      select: { classId: true },
    });
    if (!studentForCheck) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    // Teacher must be the class teacher of that class.
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.id },
      select: { classTeacherOf: { select: { id: true } } },
    });
    if (!teacher?.classTeacherOf?.id || teacher.classTeacherOf.id !== studentForCheck.classId) {
      return NextResponse.json(
        { error: "You can only edit students in your own class." },
        { status: 403 }
      );
    }
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { electiveSubjectIds, dateOfBirth, ...rest } = parsed.data;

  const existing = await prisma.student.findFirst({
    where: { id: params.id, schoolId },
    include: { schoolClass: { select: { form: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  if (rest.classId) {
    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: rest.classId, schoolId },
    });
    if (!schoolClass) return NextResponse.json({ error: "Choose a valid class." }, { status: 400 });
  }

  if (electiveSubjectIds && electiveSubjectIds.length > 0) {
    const count = await prisma.subject.count({
      where: { id: { in: electiveSubjectIds }, schoolId },
    });
    if (count !== electiveSubjectIds.length) {
      return NextResponse.json({ error: "Choose valid elective subjects." }, { status: 400 });
    }
  }

  try {
    const student = await prisma.$transaction(async (tx) => {
      if (electiveSubjectIds) {
        await tx.studentElective.deleteMany({ where: { studentId: params.id } });
        await tx.studentElective.createMany({
          data: electiveSubjectIds.map((subjectId) => ({ studentId: params.id, subjectId })),
          skipDuplicates: true,
        });
      }
      return tx.student.update({
        where: { id: params.id },
        data: {
          ...rest,
          parentName: rest.parentName === "" ? null : rest.parentName,
          parentContact: rest.parentContact === "" ? null : rest.parentContact,
          photoUrl: rest.photoUrl === "" ? null : rest.photoUrl,
          ...(dateOfBirth !== undefined
            ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }
            : {}),
        },
      });
    });

    // ── Auto-allocate dorm when boarding status is changed to BOARDING ─────
    // Only fires when:
    //   1. The incoming update explicitly sets boardingStatus to "BOARDING"
    //   2. The student wasn't already recorded as BOARDING (avoids re-allocating
    //      a student who already has a dorm just because their record was edited)
    //   3. The school has autoAllocateDorms enabled
    //   4. The student doesn't already have a current allocation
    const becomingBoarder =
      rest.boardingStatus === "BOARDING" &&
      existing.boardingStatus !== "BOARDING";

    if (becomingBoarder) {
      const [school, existingAllocation] = await Promise.all([
        prisma.school.findUnique({
          where: { id: schoolId },
          select: { autoAllocateDorms: true },
        }),
        prisma.allocationRecord.findFirst({
          where: { studentId: params.id, schoolId, status: "CURRENT" },
          select: { id: true },
        }),
      ]);

      if (school?.autoAllocateDorms && !existingAllocation) {
        // Determine form: use the updated class if classId was changed, otherwise the existing one.
        const form = rest.classId
          ? (await prisma.schoolClass.findUnique({
              where: { id: rest.classId },
              select: { form: true },
            }))?.form ?? existing.schoolClass.form
          : existing.schoolClass.form;

        // Non-fatal — student is already updated; staff can allocate manually if no slot found.
        await autoAssignDorm({
          schoolId,
          studentId: params.id,
          studentForm: form,
          allocatedById: user.id,
        }).catch(() => undefined);
      }
    }

    emitSSE(schoolId, "student.updated", student);
    return NextResponse.json(student);
  } catch {
    return NextResponse.json({ error: "Couldn't update student." }, { status: 500 });
  }
}

export async function DELETE() {
  // Hard deletion of students is permanently disabled.
  // Use POST /api/students/[id]/archive to transfer or expel a student —
  // this preserves every associated record (attendance, grades, discipline,
  // achievements, library history, etc.) and moves the student into the
  // History module.
  return NextResponse.json(
    { error: "Permanent deletion is disabled. Use the Remove Student action to archive the student instead." },
    { status: 405 }
  );
}

