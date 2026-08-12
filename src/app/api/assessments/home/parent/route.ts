import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * GET /api/assessments/home/parent
 * Returns one card per child linked to the authenticated parent/student user.
 * Guard: authenticated users with role PARENT or STUDENT.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "PARENT" && user.role !== "STUDENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find students linked to this user via parentContact or userId.
  const linkedStudents = await prisma.student.findMany({
    where: {
      schoolId: user.schoolId!,
      OR: [
        { userId: user.id },
        { parentContact: user.email },
      ],
    },
    select: {
      id: true,
      fullName: true,
      admissionNumber: true,
      classId: true,
      schoolClass: { select: { id: true, name: true } },
    },
  });

  if (linkedStudents.length === 0) {
    return NextResponse.json({ children: [] });
  }

  // Find the current period.
  const currentPeriod = await db.assessmentPeriod.findFirst({
    where: { schoolId: user.schoolId!, isCurrent: true },
    select: { id: true, name: true },
  }) as { id: string; name: string } | null;

  const children = linkedStudents.map((s) => ({
    studentId: s.id,
    fullName: s.fullName,
    admissionNumber: s.admissionNumber,
    className: s.schoolClass.name,
    periodId: currentPeriod?.id ?? null,
    periodName: currentPeriod?.name ?? null,
    latestReportUrl:
      currentPeriod
        ? `/assessments/report-card/print?periodId=${currentPeriod.id}&studentId=${s.id}`
        : null,
  }));

  return NextResponse.json({ children });
}
