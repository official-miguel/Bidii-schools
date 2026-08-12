/**
 * GET /api/subjects/[id]/detail
 *
 * Returns full subject workspace data for the SubjectWorkspaceDrawer:
 * subject info, department, applicable forms, timetable config,
 * and all assigned teachers with their staff IDs.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("SUBJECTS", "view")) ??
    (await requireSchoolPermission("STAFF", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subject = await prisma.subject.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: {
      department: { select: { id: true, name: true } },
      teacherSubjects: {
        include: {
          teacher: {
            select: { id: true, fullName: true, staffId: true, email: true },
          },
        },
        orderBy: { teacher: { fullName: "asc" } },
      },
      _count: { select: { teacherSubjects: true } },
    },
  });

  if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  return NextResponse.json(subject);
}
