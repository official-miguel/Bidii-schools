import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canViewMarksheet } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const periodId   = params.get("periodId");
  const classId    = params.get("classId");
  const subStrandId = params.get("subStrandId");

  if (!periodId || !classId || !subStrandId) {
    return NextResponse.json(
      { error: "periodId, classId, and subStrandId are required." },
      { status: 400 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canViewMarksheet(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify period belongs to school's active CBE framework.
  const period = await db.assessmentPeriod.findFirst({
    where: {
      id: periodId,
      schoolId: user.schoolId!,
      framework: { type: "CBE", isActive: true },
    },
    select: { id: true, name: true, academicYear: true, term: true },
  }) as { id: string; name: string; academicYear: string; term: number | null } | null;
  if (!period) return NextResponse.json({ error: "Period not found." }, { status: 404 });

  // Verify class belongs to school.
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId: user.schoolId! },
    select: { id: true, name: true },
  });
  if (!schoolClass) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  // Resolve sub-strand with its full parent chain for display labels.
  const subStrand = await db.subStrand.findFirst({
    where: { id: subStrandId, schoolId: user.schoolId! },
    select: {
      id: true,
      name: true,
      strand: {
        select: {
          name: true,
          learningArea: { select: { name: true } },
        },
      },
    },
  }) as {
    id: string; name: string;
    strand: { name: string; learningArea: { name: string } };
  } | null;
  if (!subStrand) return NextResponse.json({ error: "Sub-strand not found." }, { status: 404 });

  // Fetch all students in the class ordered by admissionNumber.
  const students = await prisma.student.findMany({
    where: { classId, schoolId: user.schoolId! },
    orderBy: { admissionNumber: "asc" },
    select: { id: true, fullName: true, admissionNumber: true },
  });

  if (students.length === 0) {
    return NextResponse.json({ period, subStrand, schoolClass, rows: [] });
  }

  const studentIds = students.map((s) => s.id);

  // Fetch all AssessmentItem rows for (students, period, subStrand).
  const items = await db.assessmentItem.findMany({
    where: {
      studentId:   { in: studentIds },
      periodId,
      subStrandId,
      schoolId: user.schoolId!,
      resultKind:  "PERFORMANCE_LEVEL",
    },
    select: { studentId: true, performanceLevel: true, comment: true },
  }) as Array<{ studentId: string; performanceLevel: string | null; comment: string | null }>;

  const itemMap = new Map(items.map((i) => [i.studentId, i]));

  const rows = students.map((student) => {
    const item = itemMap.get(student.id);
    return {
      student,
      level:   (item?.performanceLevel ?? null) as "EE" | "ME" | "AE" | "BE" | null,
      comment: item?.comment ?? null,
    };
  });

  return NextResponse.json({ period, subStrand, schoolClass, rows });
}
