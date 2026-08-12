import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// GET /api/history/students/[id]
//
// Full archived student profile — identical fields to the active student
// profile endpoint but includes archive metadata and works on archived students.
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("HISTORY", "view")) ??
    (await requireSchoolPermission("STUDENTS", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId!, archivedAt: { not: null } },
    include: {
      schoolClass: { select: { id: true, name: true, form: true, stream: true } },
      electives: {
        include: {
          subject: { select: { id: true, name: true, code: true, type: true } },
        },
      },
      archivedBy: { select: { email: true } },
      disciplineRecords: {
        orderBy: { dateOfOffence: "desc" },
        select: {
          id: true, offence: true, description: true, actionTaken: true,
          status: true, dateOfOffence: true, resolution: true, aiSummary: true,
          recordedBy: { select: { email: true } },
        },
      },
      achievements: {
        include: {
          achievement: {
            select: {
              id: true, title: true, category: true,
              achievementDate: true, awardLevel: true, aiSummary: true,
            },
          },
        },
      },
      attendances: {
        orderBy: { date: "desc" },
        take: 90,
        select: { id: true, date: true, status: true },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Archived student not found." }, { status: 404 });
  }

  // Attendance summary
  const totalAtt  = student.attendances.length;
  const presentAtt = student.attendances.filter((a) => a.status === "PRESENT").length;

  // Exam history snapshot
  const assessmentItems = await prisma.assessmentItem.findMany({
    where:   { studentId: student.id },
    include: { period: { select: { id: true, name: true, academicYear: true, term: true } } },
    orderBy: { period: { createdAt: "desc" } },
    take:    6,
  });

  return NextResponse.json({
    student: {
      ...student,
      attendances: undefined, // replaced with summary below
    },
    attendanceSummary: {
      total:   totalAtt,
      present: presentAtt,
      absent:  totalAtt - presentAtt,
      rate:    totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : null,
    },
    recentAttendance: student.attendances.slice(0, 14),
    assessmentSnapshot: assessmentItems.slice(0, 3).map((item) => ({
      periodId:   item.period?.id,
      periodName: item.period?.name,
      academicYear: item.period?.academicYear,
      term:       item.period?.term,
    })),
  });
}
