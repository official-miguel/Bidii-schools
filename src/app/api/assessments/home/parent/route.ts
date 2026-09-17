import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { portalStudents } from "@/lib/parentAuth";

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

  // Children come from the ParentStudent link table. The previous lookup
  // matched `parentContact: user.email` — a phone column against an email —
  // so it never matched and every parent saw an empty dashboard.
  const portal = await portalStudents(user);

  const linkedStudents = portal.length === 0 ? [] : await prisma.student.findMany({
    where: { id: { in: portal.map((s) => s.id) } },
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
