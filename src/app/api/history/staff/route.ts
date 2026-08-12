import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// GET /api/history/staff
//
// Returns paginated list of archived (transferred) staff for the History module.
//
// Query params:
//   q      — search across name, staffId, email, department, reason
//   limit  — page size 1–200, default 50
//   cursor — id of last row from previous page
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("HISTORY", "view")) ??
    (await requireSchoolPermission("STAFF", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const q      = sp.get("q")?.trim().toLowerCase() || undefined;
  const cursor = sp.get("cursor") || undefined;
  const rawLimit = parseInt(sp.get("limit") ?? "50", 10);
  const limit  = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    schoolId: user.schoolId!,
    archivedAt: { not: null },
    ...(cursor ? { id: { gt: cursor } } : {}),
  };

  const staff = await prisma.teacher.findMany({
    where,
    select: {
      id:                  true,
      staffId:             true,
      fullName:            true,
      email:               true,
      phone:               true,
      createdAt:           true,
      archivedAt:          true,
      archiveType:         true,
      archiveReason:       true,
      departmentSnapshot:  true,
      designationSnapshot: true,
      employmentStartDate: true,
      primaryDepartment: {
        select: { id: true, name: true },
      },
      teacherSubjects: {
        include: { subject: { select: { id: true, name: true, code: true } } },
      },
      archivedBy: { select: { email: true } },
      user: { select: { email: true, role: true } },
    },
    orderBy: [{ archivedAt: "desc" }, { id: "asc" }],
    take:    limit + 1,
  });

  const hasMore    = staff.length > limit;
  const page       = hasMore ? staff.slice(0, limit) : staff;
  const nextCursor = hasMore ? page[page.length - 1].id : undefined;

  const result = q
    ? page.filter((t) => {
        const search = q;
        return (
          t.fullName.toLowerCase().includes(search) ||
          t.staffId.toLowerCase().includes(search) ||
          (t.email ?? "").toLowerCase().includes(search) ||
          (t.departmentSnapshot ?? "").toLowerCase().includes(search) ||
          (t.primaryDepartment?.name ?? "").toLowerCase().includes(search) ||
          (t.archiveReason ?? "").toLowerCase().includes(search) ||
          t.teacherSubjects.some(ts =>
            ts.subject.name.toLowerCase().includes(search) ||
            ts.subject.code.toLowerCase().includes(search)
          )
        );
      })
    : page;

  const total = q ? undefined : await prisma.teacher.count({
    where: { schoolId: user.schoolId!, archivedAt: { not: null } },
  });

  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (nextCursor) headers["X-Next-Cursor"] = nextCursor;
  if (total !== undefined) headers["X-Total-Count"] = String(total);

  return NextResponse.json(result, { headers });
}
