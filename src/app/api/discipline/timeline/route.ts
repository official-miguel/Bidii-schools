import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecordsPermission } from "@/lib/permissions";

/// Chronological discipline timeline for one student. Each entry carries the
/// class/form the student was in when the offence happened (snapshotted on
/// the record) plus the case's action and resolution.
export async function GET(req: NextRequest) {
  const user = await requireRecordsPermission("RECORDS_DISCIPLINE", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId is required." }, { status: 400 });

  const records = await prisma.disciplineRecord.findMany({
    where: { studentId, schoolId: user.schoolId! },
    orderBy: { dateOfOffence: "asc" },
    select: {
      id: true,
      offence: true,
      actionTaken: true,
      resolution: true,
      status: true,
      dateOfOffence: true,
      aiSummary: true,
      classId: true,
      events: { orderBy: { createdAt: "asc" }, select: { type: true, detail: true, createdAt: true } },
    },
  });

  const classIds = Array.from(new Set(records.map((r) => r.classId).filter(Boolean))) as string[];
  const classes = classIds.length
    ? await prisma.schoolClass.findMany({
        where: { id: { in: classIds } },
        select: { id: true, name: true, form: true },
      })
    : [];
  const classMap = new Map(classes.map((c) => [c.id, c]));

  return NextResponse.json(
    records.map((r) => ({
      id: r.id,
      dateOfOffence: r.dateOfOffence,
      offence: r.offence,
      actionTaken: r.actionTaken,
      resolution: r.resolution,
      status: r.status,
      aiSummary: r.aiSummary,
      classAtTime: r.classId ? classMap.get(r.classId) ?? null : null,
      events: r.events,
    }))
  );
}
