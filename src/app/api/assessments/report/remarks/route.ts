import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canGenerateReportCard } from "@/lib/assessment/auth844";
import { callGemini, AiServiceError } from "@/lib/ai/gemini";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * GET /api/assessments/report/remarks?periodId=&studentId=
 * Returns the ReportRemark row for this (school, period, student).
 * If none exists, calls Gemini to draft one and persists it first.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const periodId  = params.get("periodId");
  const studentId = params.get("studentId");

  if (!periodId || !studentId) {
    return NextResponse.json({ error: "periodId and studentId are required." }, { status: 400 });
  }

  // Guard: canGenerateReportCard for this student's class.
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: { id: true, fullName: true, classId: true, schoolClass: { select: { name: true, form: true } } },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canGenerateReportCard(actor, student.classId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Return existing row if present.
  const existing = await db.reportRemark.findUnique({
    where: { schoolId_periodId_studentId: { schoolId: user.schoolId!, periodId, studentId } },
  }) as { id: string; draftRemark: string | null; editedRemark: string | null; isAiGenerated: boolean } | null;

  if (existing) {
    return NextResponse.json({
      studentId,
      periodId,
      draftRemark:   existing.draftRemark,
      editedRemark:  existing.editedRemark,
      isAiGenerated: existing.isAiGenerated,
    });
  }

  // No row yet — try to generate an AI draft.
  let draftRemark: string | null = null;
  let isAiGenerated = false;

  try {
    // Build a brief performance summary from assessment items.
    const items = await db.assessmentItem.findMany({
      where: { schoolId: user.schoolId!, periodId, studentId, resultKind: "NUMERIC" },
      select: { numericScore: true, subject: { select: { name: true } } },
    }) as Array<{ numericScore: number | null; subject: { name: string } | null }>;

    const summaryLines = items
      .filter((i) => i.numericScore !== null && i.subject)
      .map((i) => `${i.subject!.name}: ${i.numericScore!.toFixed(1)}%`)
      .join(", ");

    const prompt = `You are a Kenyan secondary school class teacher writing a brief end-of-term report card comment for a student.

Student: ${student.fullName}
Class: ${student.schoolClass.name} (Form ${student.schoolClass.form})
Subject scores this term: ${summaryLines || "No scores entered yet."}

Write a 2–3 sentence teacher comment suitable for printing on a report card. Be warm, specific, and constructive. Do not use vague filler phrases. Do not mention exact percentage scores — focus on strengths and one area for growth. Write in second-person ("Student name has...").`;

    draftRemark = await callGemini(user.schoolId!, prompt, {
      temperature: 0.6,
      timeoutMs: 20000,
    });
    isAiGenerated = true;
  } catch (e) {
    // AI unavailable — persist a null draft so the form still renders.
    console.warn("[report/remarks] AI draft failed:", e instanceof AiServiceError ? e.message : e);
    draftRemark = null;
    isAiGenerated = false;
  }

  // Persist the row.
  await db.reportRemark.upsert({
    where: { schoolId_periodId_studentId: { schoolId: user.schoolId!, periodId, studentId } },
    create: {
      schoolId: user.schoolId!,
      periodId,
      studentId,
      draftRemark,
      isAiGenerated,
    },
    update: {
      draftRemark,
      isAiGenerated,
    },
  });

  return NextResponse.json({
    studentId,
    periodId,
    draftRemark,
    editedRemark: null,
    isAiGenerated,
  });
}

/**
 * PUT /api/assessments/report/remarks
 * Body: { periodId, studentId, remark }
 * Saves the teacher-edited remark.
 */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { periodId, studentId, remark } = body ?? {};

  if (!periodId || !studentId || typeof remark !== "string") {
    return NextResponse.json({ error: "periodId, studentId, and remark are required." }, { status: 400 });
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: { id: true, classId: true },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canGenerateReportCard(actor, student.classId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await db.reportRemark.upsert({
    where: { schoolId_periodId_studentId: { schoolId: user.schoolId!, periodId, studentId } },
    create: {
      schoolId: user.schoolId!,
      periodId,
      studentId,
      editedRemark: remark,
      isAiGenerated: false,
    },
    update: { editedRemark: remark },
  });

  return NextResponse.json({
    studentId,
    periodId,
    draftRemark:   row.draftRemark,
    editedRemark:  row.editedRemark,
    isAiGenerated: row.isAiGenerated,
  });
}
