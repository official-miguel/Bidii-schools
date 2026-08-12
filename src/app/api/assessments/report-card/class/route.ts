import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveAssessmentActor, canGenerateReportCard } from "@/lib/assessment/auth844";
import { buildClassReportCards } from "@/lib/assessment/reportCard844";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const periodId = params.get("periodId");
  const classId = params.get("classId");

  if (!periodId || !classId) {
    return NextResponse.json(
      { error: "periodId and classId are required." },
      { status: 400 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canGenerateReportCard(actor, classId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await buildClassReportCards(classId, periodId, user.schoolId!);
  if (!data) {
    return NextResponse.json({ error: "Class or period not found." }, { status: 404 });
  }

  return NextResponse.json(data);
}
