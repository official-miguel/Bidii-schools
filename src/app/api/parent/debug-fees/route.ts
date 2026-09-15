/**
 * GET /api/parent/debug-fees
 * TEMPORARY — delete after diagnosing the fees page issue.
 * Returns the raw parent record + student IDs so we can see exactly
 * what requireParent() and a direct ParentStudent query return.
 */

import { NextResponse } from "next/server";
import { requireParent, parentStudentIds } from "@/lib/parentAuth";
import { moduleDisabledResponse } from "@/lib/moduleAccess";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const parent = await requireParent();

  if (!parent) {
    return NextResponse.json({ error: "requireParent() returned null — not authenticated or no Parent record" }, { status: 401 });
  }

  // Finance switched off for this school — the parent portal must not expose
  // fees at all, so answer as though the route does not exist.
  const feesDisabled = await moduleDisabledResponse(parent.schoolId, "FEES");
  if (feesDisabled) return feesDisabled;

  // What the relation gives us
  const relationStudentIds = [...parentStudentIds(parent)];

  // Direct query — same as /api/parent/me/children
  const directRows = await prisma.parentStudent.findMany({
    where:   { parentId: parent.id },
    orderBy: { createdAt: "asc" },
    select:  { studentId: true },
  });

  return NextResponse.json({
    parentId:            parent.id,
    userId:              parent.userId,
    schoolId:            parent.schoolId,
    studentsFromRelation: parent.students,          // raw relation array
    relationStudentIds,                              // after parentStudentIds()
    directRows,                                      // from direct query
    directStudentIds:    directRows.map(r => r.studentId),
  });
}
