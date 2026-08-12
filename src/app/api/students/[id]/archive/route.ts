import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

// ---------------------------------------------------------------------------
// POST /api/students/[id]/archive
//
// Archives a student — removing them from the active Students module while
// preserving every associated record (attendance, assessments, discipline,
// achievements, library, files, etc.).
//
// Body:
//   type    — "TRANSFER" | "EXPULSION"
//   reason  — required when type === "EXPULSION"; optional for TRANSFER
//
// On EXPULSION:
//   1. Creates a DisciplineRecord marked as EXPULSION with the given reason
//   2. Archives the student
//   3. Writes an AuditLog entry
//
// On TRANSFER:
//   1. Archives the student
//   2. Writes an AuditLog entry
// ---------------------------------------------------------------------------

const archiveSchema = z.object({
  type:   z.enum(["TRANSFER", "EXPULSION"]),
  reason: z.string().trim().optional().or(z.literal("")),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Principal always allowed; ADMIN_STAFF with STUDENTS manage also allowed.
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("STUDENTS", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = archiveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { type, reason } = parsed.data;

  if (type === "EXPULSION" && !reason) {
    return NextResponse.json(
      { error: "A reason is required when expelling a student." },
      { status: 400 }
    );
  }

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: { schoolClass: { select: { id: true, name: true } } },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  if (student.archivedAt) {
    return NextResponse.json(
      { error: "This student is already archived." },
      { status: 409 }
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // 1. For expulsions — create a discipline record
    if (type === "EXPULSION" && reason) {
      await tx.disciplineRecord.create({
        data: {
          schoolId:     user.schoolId,
          studentId:    student.id,
          classId:      student.classId,
          offence:      "Expulsion",
          description:  reason,
          actionTaken:  "Student expelled and removed from active enrollment.",
          status:       "RESOLVED",
          dateOfOffence: now,
          recordedById: user.id,
          events: {
            create: {
              type:       "EXPULSION",
              detail:     `Student expelled. Reason: ${reason}`,
              createdById: user.id,
            },
          },
        },
      });
    }

    // 2. Archive the student
    await tx.student.update({
      where: { id: student.id },
      data: {
        archivedAt:   now,
        archiveType:  type,
        archiveReason: reason || null,
        archivedById: user.id,
      },
    });

    // 3. Write audit log
    await tx.auditLog.create({
      data: {
        schoolId:      user.schoolId,
        action:        "STUDENT_ARCHIVED",
        performedById: user.id,
        performedAt:   now,
        detail: {
          studentId:       student.id,
          admissionNumber: student.admissionNumber,
          fullName:        student.fullName,
          lastClass:       student.schoolClass?.name ?? null,
          archiveType:     type,
          reason:          reason || null,
        },
      },
    });
  });

  // Notify live listeners
  emitSSE(user.schoolId, "student.archived", {
    id:          student.id,
    archiveType: type,
  });

  return NextResponse.json({ ok: true, archiveType: type });
}
