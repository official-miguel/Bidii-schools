/**
 * GET /api/departments/[id]/available-subjects
 *
 * Returns all school subjects that are NOT currently assigned to this
 * department. Used by the DepartmentWorkspaceDrawer to populate the
 * "Add subjects" picker.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("DEPARTMENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Confirm the department belongs to this school
  const dept = await prisma.department.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!dept) return NextResponse.json({ error: "Department not found." }, { status: 404 });

  // Return subjects belonging to the school but NOT this department
  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId!,
      departmentId: { not: params.id },
    },
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      department: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(subjects);
}
