/**
 * POST /api/parent/results/ai-insights
 *
 * AI-generated commentary on a child's CBE results for the parent portal.
 * Two modes:
 *   - { periodId }                — insight on a single period (what's going
 *                                    well, what needs attention, subjects to
 *                                    focus on for a target course/career).
 *   - { periodId, comparePeriodId } — compares two periods explicitly.
 *
 * `question` (optional) overrides the default prompt — e.g. a parent asking
 * "Which subjects should he focus on for engineering?".
 *
 * Every response is cached per (student, period[, comparePeriod], question)
 * for 30 minutes via callGemini's built-in cache, so re-opening the panel or
 * multiple parents on the same period don't re-spend Gemini calls — this is
 * the rate-limit-minimizing design requested for this feature.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { getResultsAnalysis, type PeriodAnalysis } from "@/lib/parent/resultsAnalysis";
import { callGemini, AiServiceError } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

function summarizePeriod(p: PeriodAnalysis): string {
  const lines = p.subjects
    .map((s) => `  - ${s.subjectName}: ${s.bandName ?? "—"} (${s.numericScore ?? "—"} marks, ${s.points ?? "—"} pts)`)
    .join("\n");
  return `${p.period.name} (${p.period.academicYear}${p.period.term ? `, Term ${p.period.term}` : ""}):
  Overall: ${p.overall?.gradeBand ?? "—"}, ${p.overall?.totalPoints ?? 0} points, mean ${p.overall?.meanPercentage ?? 0}%
${lines}`;
}

export async function POST(req: NextRequest) {
  const parent = await requireParent();
  if (!parent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(parent.userId))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null) as {
    studentId?: string;
    periodId?: string;
    comparePeriodId?: string;
    question?: string;
  } | null;

  if (!body?.studentId || !body.periodId) {
    return NextResponse.json({ error: "studentId and periodId are required." }, { status: 400 });
  }

  if (!ownsStudent(parent, body.studentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [student, analysis] = await Promise.all([
    prisma.student.findUnique({
      where:  { id: body.studentId },
      select: { fullName: true, schoolClass: { select: { name: true } } },
    }),
    getResultsAnalysis(parent.schoolId, body.studentId),
  ]);

  const period = analysis.find((a) => a.period.id === body.periodId);
  if (!period) {
    return NextResponse.json({ error: "No SMS-released results found for that period." }, { status: 404 });
  }
  const comparePeriod = body.comparePeriodId
    ? analysis.find((a) => a.period.id === body.comparePeriodId)
    : null;

  const question = body.question?.trim() || null;

  const defaultInstruction = question
    ? question
    : `Give the parent a short, plain-language read of ${student?.fullName ?? "the learner"}'s results: what's going well, ` +
      `what needs attention, and — most importantly — which subjects they should encourage more effort in if the learner wants ` +
      `to pursue a competitive course/career later (e.g. medicine, engineering, law). Be specific about subjects, not generic advice.`;

  const prompt = `You are Soma, the school's AI assistant, speaking directly to a parent about their child's CBE (Competency-Based Education) results.
Student: ${student?.fullName ?? "Learner"}${student?.schoolClass ? `, ${student.schoolClass.name}` : ""}

${summarizePeriod(period)}
${comparePeriod ? `\nCompared against:\n${summarizePeriod(comparePeriod)}` : ""}

Grading scale: KNEC CBE Achievement Levels (EE1–BE2), 8 bands, higher points = stronger performance. Never mention KCSE letter grades or KCSE points — this school uses CBE bands only.

Parent's request: ${defaultInstruction}

Respond in under 180 words, warm but direct, in 3 short paragraphs or a short bulleted list. Do not repeat the raw numbers back verbatim — interpret them.`;

  try {
    const text = await callGemini(parent.schoolId, prompt, {
      // 30-minute cache: same question on the same period reuses the answer
      // instead of spending another Gemini call — keeps this feature well
      // within rate limits even with many parents checking the same period.
      cacheTtlMs: 30 * 60 * 1000,
      maxOutputTokens: 512,
      temperature: 0.4,
    });
    return NextResponse.json({ insight: text });
  } catch (err) {
    if (err instanceof AiServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.configIssue ? 422 : 502 });
    }
    return NextResponse.json({ error: "Couldn't generate insights right now. Try again shortly." }, { status: 502 });
  }
}
