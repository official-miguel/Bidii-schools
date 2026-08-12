import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser , requireSchoolRole } from "@/lib/auth";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import { prisma } from "@/lib/prisma";
import {
  detectAtRisk,
  detectAnomalies,
  answerNlQuery,
  generateRecommendations,
  type NarrativeInput,
} from "@/lib/assessment/aiAssessment";
import {
  scoreToGrade,
  subjectScore,
} from "@/lib/assessment/grading844";
import {
  meanAttainment,
  attainmentToLevel,
  type PerformanceLevel,
} from "@/lib/assessment/gradingCbe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const bodySchema = z.object({
  periodId:  z.string().min(1),
  classId:   z.string().min(1),
  /** Optional NL question for the dashboard query feature. */
  question:  z.string().max(500).optional(),
  /** When set to a studentId, returns per-student recommendations too. */
  studentId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.schoolId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = user.schoolId!;

  const actor = await resolveAssessmentActor(user, schoolId);
  if (!canAccessDashboard(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { periodId, classId, question, studentId } = parsed.data;

  // Resolve framework for this class.
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId },
    select: { frameworkType: true, form: true },
  });
  const framework = (schoolClass?.frameworkType ?? "EIGHT_FOUR_FOUR") as string;

  // ---- Run all three data-only analyses in parallel (no AI calls) ----
  const [atRiskReport, anomalyReport] = await Promise.all([
    detectAtRisk(schoolId, classId, periodId),
    detectAnomalies(schoolId, periodId, classId),
  ]);

  // ---- Build dashboard context string for NL query ----
  const contextLines: string[] = [
    `Framework: ${framework}`,
    `At-risk students: ${atRiskReport.atRisk.length}/${atRiskReport.checkedCount}`,
    `Anomaly flags: ${anomalyReport.flags.length} (checked ${anomalyReport.checked} entries)`,
  ];

  // Add lightweight perf summary to context.
  if (framework === "EIGHT_FOUR_FOUR") {
    const fw = await db.assessmentFramework.findFirst({
      where: { schoolId, type: "EIGHT_FOUR_FOUR", isActive: true },
      select: { id: true },
    }) as { id: string } | null;

    if (fw) {
      const subjects = await prisma.subject.findMany({
        where: { schoolId, applicableForms: { has: schoolClass?.form ?? 1 } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      const papers = await db.paper.findMany({
        where: { frameworkId: fw.id, subjectId: { in: subjects.map((s: { id: string }) => s.id) } },
        select: { id: true, subjectId: true, maxMarks: true },
      }) as Array<{ id: string; subjectId: string; maxMarks: number }>;
      const students = await prisma.student.findMany({
        where: { classId, schoolId },
        select: { id: true },
      });
      const items = await db.assessmentItem.findMany({
        where: { periodId, studentId: { in: students.map((s: { id: string }) => s.id) }, schoolId, resultKind: "NUMERIC" },
        select: { studentId: true, paperId: true, numericScore: true },
      }) as Array<{ studentId: string; paperId: string; numericScore: number | null }>;

      for (const subj of subjects.slice(0, 8)) {
        const sPapers = papers.filter((p) => p.subjectId === subj.id);
        const scores  = students.map((st: { id: string }) => {
          const ps = sPapers.map((p) => items.find((i) => i.studentId === st.id && i.paperId === p.id)?.numericScore ?? null);
          return subjectScore(ps, sPapers.map((p) => p.maxMarks));
        }).filter((s): s is number => s !== null);
        if (scores.length > 0) {
          const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
          contextLines.push(`${subj.name}: class mean ${mean.toFixed(1)}% (${scoreToGrade(mean).grade})`);
        }
      }
    }
  } else {
    const fw = await db.assessmentFramework.findFirst({
      where: { schoolId, type: "CBE", isActive: true },
      select: { id: true },
    }) as { id: string } | null;

    if (fw) {
      const las = await db.learningArea.findMany({
        where: { frameworkId: fw.id, schoolId },
        select: { id: true, name: true },
        take: 8,
      }) as Array<{ id: string; name: string }>;
      const students = await prisma.student.findMany({
        where: { classId, schoolId },
        select: { id: true },
      });
      const items = await db.assessmentItem.findMany({
        where: {
          periodId,
          studentId: { in: students.map((s: { id: string }) => s.id) },
          schoolId,
          resultKind: "PERFORMANCE_LEVEL",
          learningAreaId: { in: las.map((la) => la.id) },
        },
        select: { learningAreaId: true, performanceLevel: true },
      }) as Array<{ learningAreaId: string; performanceLevel: PerformanceLevel | null }>;

      for (const la of las) {
        const levels = items.filter((i) => i.learningAreaId === la.id).map((i) => i.performanceLevel);
        const mean   = meanAttainment(levels);
        if (mean !== null) {
          contextLines.push(`${la.name}: class mean ${mean.toFixed(2)} (${attainmentToLevel(mean)})`);
        }
      }
    }
  }

  const contextString = contextLines.join("\n");

  // ---- NL query (only when question is provided) ----
  const nlResult = question
    ? await answerNlQuery(schoolId, question, contextString)
    : null;

  // ---- Per-student recommendations (only when studentId is provided) ----
  let recommendationsResult = null;
  if (studentId) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { fullName: true },
    });
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });

    if (student) {
      const input: NarrativeInput = {
        framework: framework === "CBE" ? "CBE" : "EIGHT_FOUR_FOUR",
        studentName: student.fullName,
        schoolName:  school?.name ?? "",
        periodName:  periodId,
      };
      recommendationsResult = await generateRecommendations(schoolId, input);
    }
  }

  return NextResponse.json({
    framework,
    atRisk:       atRiskReport,
    anomalies:    anomalyReport,
    nlAnswer:     nlResult,
    recommendations: recommendationsResult,
    contextSummary: contextString,
  });
}
