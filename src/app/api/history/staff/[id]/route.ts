import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// GET /api/history/staff/[id]
//
// Full archived staff profile — includes employment history, subjects taught,
// class assignments, and all historical data.
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("HISTORY", "view")) ??
    (await requireSchoolPermission("STAFF", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findFirst({
    where: { id: params.id, schoolId: user.schoolId!, archivedAt: { not: null } },
    include: {
      primaryDepartment: { select: { id: true, name: true } },
      teacherSubjects: {
        include: { subject: { select: { id: true, name: true, code: true } } },
      },
      archivedBy: { select: { email: true } },
      user: { select: { email: true, role: true, isActive: true } },
      // Past timetable slots (historical, may be empty if reassigned)
      timetableSlots: {
        take: 20,
        include: {
          subject:    { select: { name: true, code: true } },
          schoolClass: { select: { name: true, form: true } },
        },
      },
    },
  });

  if (!teacher) {
    return NextResponse.json({ error: "Archived staff member not found." }, { status: 404 });
  }

  return NextResponse.json(teacher);
}
