import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";
import { buildResultsMessage } from "@/lib/messaging/examResults";

export async function GET(
  req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) return NextResponse.json({ error: "periodId required." }, { status: 400 });

  // Verify student and period belong to school
  const [student, period] = await Promise.all([
    prisma.student.findUnique({ where: { id: params.studentId }, select: { schoolId: true } }),
    prisma.assessmentPeriod.findUnique({ where: { id: periodId }, select: { schoolId: true } }),
  ]);

  if (!student || student.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  if (!period || period.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Period not found." }, { status: 404 });
  }

  const settings = await prisma.messagingSettings.findUnique({ where: { schoolId: user.schoolId } });
  const closing  = settings?.resultsClosing ?? "Thank you for your continued support.";

  const payload = await buildResultsMessage(params.studentId, periodId, user.schoolId, closing);

  // Mask phone for client
  const maskedPhone = payload.phone && payload.phone.length > 4
    ? `${"*".repeat(Math.max(0, payload.phone.length - 4))}${payload.phone.slice(-4)}`
    : payload.phone;

  return NextResponse.json({ ...payload, phone: maskedPhone });
}
