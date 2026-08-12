import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";

/**
 * GET /api/staff-roles/search-users?q=<query>&roleId=<staffRoleId>
 *
 * Returns active school users of role ADMIN_STAFF or TEACHER that match the
 * search term (against email, teacher full name, and staff ID).
 *
 * Also returns whether each user is already assigned to `roleId` so the UI
 * can show an "Assign / Remove" toggle without a separate lookup.
 */
export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q      = searchParams.get("q")?.trim() ?? "";
  const roleId = searchParams.get("roleId") ?? "";

  if (q.length < 1) return NextResponse.json({ users: [] });

  // Find matching active users (ADMIN_STAFF or TEACHER) in this school
  const users = await prisma.user.findMany({
    where: {
      schoolId: user.schoolId!,
      isActive:  true,
      role:      { in: ["ADMIN_STAFF", "TEACHER"] },
      OR: [
        { email:   { contains: q, mode: "insensitive" } },
        { teacher: { fullName: { contains: q, mode: "insensitive" } } },
        { teacher: { staffId:  { contains: q, mode: "insensitive" } } },
      ],
    },
    select: {
      id:    true,
      email: true,
      role:  true,
      staffRoleId:    true,
      userStaffRoles: { select: { staffRoleId: true } },
      teacher: {
        select: {
          fullName:     true,
          staffId:      true,
          classTeacherOf: { select: { name: true } },
        },
      },
    },
    take: 20,
    orderBy: { email: "asc" },
  });

  // Resolve which users already hold the requested role
  const assignedInRole = roleId
    ? new Set(
        users
          .filter(
            (u) =>
              u.staffRoleId === roleId ||
              u.userStaffRoles.some((r) => r.staffRoleId === roleId)
          )
          .map((u) => u.id)
      )
    : new Set<string>();

  const result = users.map((u) => ({
    id:            u.id,
    email:         u.email,
    role:          u.role,
    fullName:      u.teacher?.fullName  ?? null,
    staffId:       u.teacher?.staffId   ?? null,
    classTeacher:  u.teacher?.classTeacherOf?.name ?? null,
    alreadyAssigned: assignedInRole.has(u.id),
  }));

  return NextResponse.json({ users: result });
}
