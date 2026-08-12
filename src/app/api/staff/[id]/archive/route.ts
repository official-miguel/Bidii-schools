import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";

// ---------------------------------------------------------------------------
// POST /api/staff/[id]/archive
//
// Archives a staff member — removing them from the active Staff directory
// while preserving every associated record (attendance, timetable history,
// assessment data, subjects taught, etc.).
//
// On archive:
//   1. Deactivates the staff member's login account (if any)
//   2. Snapshots department/designation for historical display
//   3. Marks the teacher row as archived
//   4. Releases the staff ID into the RecycledStaffId pool
//   5. Writes an AuditLog entry
//
// Body (all optional):
//   reason — departure reason / notes
// ---------------------------------------------------------------------------

const archiveSchema = z.object({
  reason: z.string().trim().optional().or(z.literal("")),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = archiveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { reason } = parsed.data;

  const teacher = await prisma.teacher.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: {
      primaryDepartment: { select: { name: true } },
      classTeacherOf:    { select: { name: true } },
      user:              { select: { id: true, email: true, role: true } },
    },
  });
  if (!teacher) {
    return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }
  if (teacher.archivedAt) {
    return NextResponse.json(
      { error: "This staff member is already archived." },
      { status: 409 }
    );
  }

  const now = new Date();
  const deptName = teacher.primaryDepartment?.name ?? null;

  // Only recycle numeric staff IDs — same logic as the main staff route
  const isNumericId = /^\d+$/.test(teacher.staffId);

  await prisma.$transaction(async (tx) => {
    // 1. Deactivate login account
    if (teacher.userId) {
      await tx.user.update({
        where: { id: teacher.userId },
        data:  { isActive: false },
      });
    }

    // 2. Archive the teacher row — snapshot dept/designation
    await tx.teacher.update({
      where: { id: teacher.id },
      data: {
        archivedAt:          now,
        archiveType:         "TRANSFER",
        archiveReason:       reason || null,
        archivedById:        user.id,
        departmentSnapshot:  deptName,
        // employmentStartDate: already set or null — don't overwrite
      },
    });

    // 3. Release numeric staff ID for recycling
    if (isNumericId) {
      await tx.recycledStaffId.upsert({
        where:  { schoolId_staffId: { schoolId: user.schoolId!, staffId: teacher.staffId } },
        create: { schoolId: user.schoolId!, staffId: teacher.staffId },
        update: {}, // Already freed — no-op
      });
    }

    // 4. Audit log
    await tx.auditLog.create({
      data: {
        schoolId: user.schoolId!,
        action:        "STAFF_ARCHIVED",
        performedById: user.id,
        performedAt:   now,
        detail: {
          teacherId:  teacher.id,
          staffId:    teacher.staffId,
          fullName:   teacher.fullName,
          email:      teacher.user?.email ?? null,
          department: deptName,
          reason:     reason || null,
        },
      },
    });
  });

  emitSSE(user.schoolId!, "teacher.archived", { id: teacher.id });

  return NextResponse.json({ ok: true });
}
