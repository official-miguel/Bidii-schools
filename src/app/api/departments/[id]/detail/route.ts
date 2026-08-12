/**
 * GET /api/departments/[id]/detail
 *
 * Returns full department workspace data for the DepartmentWorkspaceDrawer:
 * department info, head teacher, assigned staff, and subjects.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("DEPARTMENTS", "view")) ??
    (await requireSchoolPermission("STAFF", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dept = await prisma.department.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: {
      headTeacher: {
        select: { id: true, fullName: true, email: true },
      },
      subjects: {
        select: { id: true, name: true, code: true, type: true },
        orderBy: { name: "asc" },
      },
      teachers: {
        where: { archivedAt: null },
        select: { id: true, fullName: true, email: true, staffId: true },
        orderBy: { fullName: "asc" },
        take: 25,
      },
      _count: {
        select: {
          subjects: true,
          teachers: { where: { archivedAt: null } },
        },
      },
    },
  });

  if (!dept) return NextResponse.json({ error: "Department not found." }, { status: 404 });
  return NextResponse.json(dept);
}
