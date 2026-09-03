/**
 * GET /api/parent/me/children
 *
 * Returns the list of students linked to the authenticated parent.
 * Used by ParentHydrator on mount to seed the Zustand parent store.
 *
 * Requirements: 3.2, 3.4
 */

import { NextResponse } from "next/server";
import { requireParent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import type { ChildSummary } from "@/lib/stores/parentStore";

// Ensure fresh data on every request — never serve a cached child list.
export const dynamic = "force-dynamic";

export async function GET() {
  const parent = await requireParent();
  if (!parent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(parent.userId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parentStudents = await prisma.parentStudent.findMany({
    where:   { parentId: parent.id },
    orderBy: { createdAt: "asc" },
    select: {
      student: {
        select: {
          id:              true,
          fullName:        true,
          admissionNumber: true,
          classId:         true,
          schoolClass:     { select: { name: true } },
        },
      },
    },
  });

  const children: ChildSummary[] = parentStudents.map(({ student }) => ({
    id:              student.id,
    fullName:        student.fullName,
    admissionNumber: student.admissionNumber,
    classId:         student.classId,
    className:       student.schoolClass.name,
  }));

  return NextResponse.json(children);
}
