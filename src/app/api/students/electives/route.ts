import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// GET /api/students/electives?classId=&subjectId=&unenrolled=1
// Returns students in the class NOT yet enrolled in the given elective subject.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !["TEACHER", "PRINCIPAL", "ADMIN_STAFF"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const classId = params.get("classId");
  const subjectId = params.get("subjectId");

  if (!classId || !subjectId) {
    return NextResponse.json({ error: "classId and subjectId are required." }, { status: 400 });
  }

  // All active students in the class
  const allStudents = await prisma.student.findMany({
    where: { classId, schoolId: user.schoolId!, archivedAt: null },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, admissionNumber: true },
  });

  // Students already enrolled in this elective
  const enrolled = await prisma.studentElective.findMany({
    where: { subjectId, student: { classId, schoolId: user.schoolId! } },
    select: { studentId: true },
  });
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));

  const unenrolled = allStudents.filter((s) => !enrolledIds.has(s.id));
  return NextResponse.json(unenrolled);
}

const postSchema = z.object({
  subjectId: z.string().min(1),
  studentIds: z.array(z.string().min(1)).min(1),
});

// POST /api/students/electives
// Creates StudentElective rows for the given students + subject.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !["TEACHER", "PRINCIPAL", "ADMIN_STAFF"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { subjectId, studentIds } = parsed.data;

  // Verify subject belongs to this school
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });

  // Verify all students belong to this school
  const studentCount = await prisma.student.count({
    where: { id: { in: studentIds }, schoolId: user.schoolId! },
  });
  if (studentCount !== studentIds.length) {
    return NextResponse.json({ error: "One or more students not found." }, { status: 400 });
  }

  await prisma.studentElective.createMany({
    data: studentIds.map((studentId) => ({ studentId, subjectId })),
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true, enrolled: studentIds.length }, { status: 201 });
}
