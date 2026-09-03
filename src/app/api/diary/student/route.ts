import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { resolveStatus } from "../_lib";

export async function GET(_req: NextRequest) {
  const user = await requireSchoolRole("STUDENT");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: {
      userId:     user.id,
      schoolId:   user.schoolId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student record not found." }, { status: 404 });
  }

  const recipients = await prisma.diaryRecipient.findMany({
    where: {
      studentId:  student.id,
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

  return NextResponse.json(enriched);
}
