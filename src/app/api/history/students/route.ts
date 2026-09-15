import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// GET /api/history/students
//
// Returns paginated list of archived students for the History module.
// Includes both TRANSFER and EXPULSION types, plus GRADUATION.
//
// Query params:
//   type   — "TRANSFER" | "EXPULSION" | "GRADUATION" | "" (all)
//   q      — search across name, admissionNumber, class name, reason
//   limit  — page size 1–200, default 50
//   cursor — id of last row from previous page
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("HISTORY", "view")) ??
    (await requireSchoolPermission("STUDENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;

  // `type` accepts one archive type or a comma-separated list, so a caller can
  // ask for leavers (TRANSFER,EXPULSION) without also getting graduands. It
  // used to take a single value only, and the Transferred Students tab had no
  // way to express "these two but not graduations" — it sent nothing, which
  // means no filter, which is why graduands appeared under Transferred.
  const ARCHIVE_TYPES = ["TRANSFER", "EXPULSION", "GRADUATION"];
  const requestedTypes = (sp.get("type") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => ARCHIVE_TYPES.includes(t));

  const typeFilter =
    requestedTypes.length === 0 ? {} :
    requestedTypes.length === 1 ? { archiveType: requestedTypes[0] } :
                                  { archiveType: { in: requestedTypes } };
  const q      = sp.get("q")?.trim().toLowerCase() || undefined;
  const cursor = sp.get("cursor") || undefined;
  const rawLimit = parseInt(sp.get("limit") ?? "50", 10);
  const limit  = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    schoolId: user.schoolId!,
    archivedAt: { not: null },
    ...typeFilter,
    ...(cursor ? { id: { gt: cursor } } : {}),
  };

  // Text search applied in-memory after fetch for simplicity — the
  // archived list is small enough that this avoids complex raw SQL.
  const students = await prisma.student.findMany({
    where,
    select: {
      id:             true,
      admissionNumber: true,
      fullName:       true,
      dateOfBirth:    true,
      parentName:     true,
      parentContact:  true,
      createdAt:      true,
      archivedAt:     true,
      archiveType:    true,
      archiveReason:  true,
      schoolClass: {
        select: { id: true, name: true, form: true, stream: true },
      },
      archivedBy: {
        select: { email: true },
      },
      disciplineRecords: {
        where:   { offence: "Expulsion" },
        orderBy: { createdAt: "desc" },
        take:    1,
        select:  { id: true, dateOfOffence: true, description: true },
      },
    },
    orderBy: [{ archivedAt: "desc" }, { id: "asc" }],
    take:    limit + 1,
  });

  const hasMore    = students.length > limit;
  const page       = hasMore ? students.slice(0, limit) : students;
  const nextCursor = hasMore ? page[page.length - 1].id : undefined;

  // Apply search filter if provided
  const result = q
    ? page.filter((s) => {
        const search = q;
        return (
          s.fullName.toLowerCase().includes(search) ||
          s.admissionNumber.toLowerCase().includes(search) ||
          s.schoolClass.name.toLowerCase().includes(search) ||
          (s.parentName ?? "").toLowerCase().includes(search) ||
          (s.parentContact ?? "").toLowerCase().includes(search) ||
          (s.archiveReason ?? "").toLowerCase().includes(search)
        );
      })
    : page;

  const total = q ? undefined : await prisma.student.count({
    where: { schoolId: user.schoolId!, archivedAt: { not: null }, ...typeFilter },
  });

  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (nextCursor) headers["X-Next-Cursor"] = nextCursor;
  if (total !== undefined) headers["X-Total-Count"] = String(total);

  return NextResponse.json(result, { headers });
}
