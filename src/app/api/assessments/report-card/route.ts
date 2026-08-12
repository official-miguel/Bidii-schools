import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveAssessmentActor, canGenerateReportCard } from "@/lib/assessment/auth844";
import { buildReportCard } from "@/lib/assessment/reportCard844";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const periodId = params.get("periodId");
  const studentId = params.get("studentId");

  if (!periodId || !studentId) {
    return NextResponse.json(
      { error: "periodId and studentId are required." },
      { status: 400 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Need the student's classId to check report card access.
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: { classId: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canGenerateReportCard(actor, student.classId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await buildReportCard(studentId, periodId, user.schoolId!);
  if (!data) {
    return NextResponse.json({ error: "Report card data not found." }, { status: 404 });
  }

  // Report cards are expensive to compute and change only when marks are
  // updated.  Cache for 5 minutes; ETag allows 304 on unchanged data.
  const etag = `"rc-${createHash("sha1")
    .update(JSON.stringify(data))
    .digest("hex")
    .slice(0, 20)}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, max-age=300" },
    });
  }

  return NextResponse.json(data, {
    headers: { ETag: etag, "Cache-Control": "private, max-age=300" },
  });
}
