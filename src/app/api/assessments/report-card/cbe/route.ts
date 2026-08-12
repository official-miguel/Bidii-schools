import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveAssessmentActor, canGenerateReportCard } from "@/lib/assessment/auth844";
import { buildCbeReportCard } from "@/lib/assessment/reportCardCbe";
import { prisma } from "@/lib/prisma";

/** GET /api/assessments/report-card/cbe?periodId=&studentId= */
export async function GET(req: NextRequest) {
  const params    = req.nextUrl.searchParams;
  const periodId  = params.get("periodId");
  const studentId = params.get("studentId");

  if (!periodId || !studentId) {
    return NextResponse.json({ error: "periodId and studentId are required." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: { classId: true },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canGenerateReportCard(actor, student.classId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await buildCbeReportCard(studentId, periodId, user.schoolId!);
  if (!data) return NextResponse.json({ error: "Report card data not found." }, { status: 404 });

  return NextResponse.json(data);
}
