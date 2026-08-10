import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/me
 *
 * Returns the current user's own profile data — safe, read-only snapshot.
 * Used by the My Profile page across all non-parent dashboards.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // For TEACHER: also fetch their staff record for richer profile info.
  const teacher =
    user.role === "TEACHER"
      ? await prisma.teacher.findUnique({
          where: { userId: user.id },
          select: {
            fullName: true,
            designation: true,
            email: true,
            phone: true,
            staffId: true,
            employmentStartDate: true,
            primaryDepartment: { select: { name: true } },
            classTeacherOf: { select: { name: true } },
          },
        })
      : null;

  return NextResponse.json({
    id:        user.id,
    email:     user.email,
    role:      user.role,
    avatarUrl: user.avatarUrl ?? null,
    teacher,
  });
}
