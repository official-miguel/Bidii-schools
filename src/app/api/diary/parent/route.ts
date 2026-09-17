import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { portalStudents } from "@/lib/parentAuth";
import { resolveStatus } from "../_lib";

export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("PARENT", "STUDENT");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentIdParam = req.nextUrl.searchParams.get("studentId") ?? undefined;

  // Children come from the ParentStudent link table. The previous lookup
  // matched `parentContact: user.email` — a phone column against an email —
  // so it never matched and the diary always came back empty for parents.
  const portal = await portalStudents(user);

  const students = portal.length === 0 ? [] : await prisma.student.findMany({
    where: { id: { in: portal.map((s) => s.id) } },
    select: {
      id:          true,
      fullName:    true,
      classId:     true,
      schoolClass: { select: { name: true } },
    },
    orderBy: { fullName: "asc" },
  });

  if (students.length === 0) {
    return NextResponse.json({ students: [], entries: [] });
  }

  // If a specific student is requested, verify they belong to this parent
  let targetStudentId: string;
  if (studentIdParam) {
    const owned = students.find((s) => s.id === studentIdParam);
    if (!owned) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    targetStudentId = studentIdParam;
  } else {
    targetStudentId = students[0].id;
  }

  const recipients = await prisma.diaryRecipient.findMany({
    where: {
      studentId:  targetStudentId,
      schoolId:   user.schoolId,
      diaryEntry: { deletedAt: null },
    },
    include: {
      diaryEntry: {
        include: {
          subject: { select: { name: true } },
          targets: {
            include: { schoolClass: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { diaryEntry: { createdAt: "desc" } },
    take:    20,
  });

  const enriched = recipients.map((r) => ({
    ...r,
    resolvedStatus: resolveStatus(
      r.status as "PENDING" | "COMPLETED",
      r.diaryEntry.dueDate
    ),
  }));

  return NextResponse.json({ students, entries: enriched, activeStudentId: targetStudentId });
}
