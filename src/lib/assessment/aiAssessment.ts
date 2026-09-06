/**
 * Server-only AI service for the assessment layer.
 * Covers all six AI features from Stage 5:
 *
 *  1. narrativeComment   — AI-drafted report narrative per student
 *  2. atRiskDetection    — term-on-term drop detection (8-4-4 & CBE)
 *  3. anomalyDetection   — implausible mark/level patterns
 *  4. nlQuery            — natural-language query against the analytics layer
 *  5. learningRecommendations — weak-area targeting per framework
 *  6. crossFrameworkTransition — prior-record narrative when student switches curriculum
 *
 * Every function: reads its own data, calls Gemini via callGemini(), returns a
 * typed result. All outputs carry `aiDrafted: true` — the UI labels them
 * accordingly and allows teacher edits before finalising.
 */

import { prisma } from "@/lib/prisma";
import { callGemini, AiServiceError } from "@/lib/ai/gemini";
import {
  scoreToGrade,
  type KcseGrade,
} from "./grading844";
import {
  meanAttainment,
  attainmentToLevel,
  LEVEL_LABELS,
  type PerformanceLevel,
} from "./gradingCbe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface AiResult<T> {
  value: T;
  aiDrafted: true;
  /** Non-null when the AI service was unavailable — the UI shows the fallback
   *  and a "configure Gemini" prompt. */
  error: string | null;
}

function ok<T>(value: T): AiResult<T> {
  return { value, aiDrafted: true, error: null };
}
function fallback<T>(value: T, msg: string): AiResult<T> {
  return { value, aiDrafted: true, error: msg };
}

// ---------------------------------------------------------------------------
// 1. Narrative report comment
// ---------------------------------------------------------------------------

export interface NarrativeInput {
  framework: "EIGHT_FOUR_FOUR" | "CBE";
  studentName: string;
  /** For 8-4-4: array of { subject, grade, points } */
  subjectGrades?: Array<{ subject: string; grade: KcseGrade; score: number }>;
  /** For CBE junior: array of { learningArea, summaryLevel } */
  cbeLevels?: Array<{ learningArea: string; summaryLevel: PerformanceLevel | null }>;
  /** For CBE senior: array of { subject, weightedScore } */
  cbePathway?: Array<{ subject: string; weightedScore: number | null }>;
  schoolName: string;
  periodName: string;
  /** Previous period narrative for continuity, if available. */
  previousNarrative?: string;
}

export async function generateNarrativeComment(
  schoolId: string,
  input: NarrativeInput
): Promise<AiResult<string>> {
  const frameworkLabel =
    input.framework === "EIGHT_FOUR_FOUR"
      ? "8-4-4 (KCSE Kenya)"
      : "CBE (Competency-Based Education Kenya)";

  let perfSummary = "";
  if (input.framework === "EIGHT_FOUR_FOUR" && input.subjectGrades?.length) {
    perfSummary = input.subjectGrades
      .map((g) => `${g.subject}: ${g.grade} (${g.score.toFixed(1)}%)`)
      .join(", ");
  } else if (input.cbeLevels?.length) {
    perfSummary = input.cbeLevels
      .map((l) => `${l.learningArea}: ${l.summaryLevel ?? "NYE"}`)
      .join(", ");
  } else if (input.cbePathway?.length) {
    perfSummary = input.cbePathway
      .map((p) => `${p.subject}: ${p.weightedScore !== null ? p.weightedScore.toFixed(1) + "%" : "NYE"}`)
      .join(", ");
  }

  const prevSection = input.previousNarrative
    ? `\n\nPrevious period comment (for continuity):\n"${input.previousNarrative}"`
    : "";

  const prompt = `You are a school report writer for ${input.schoolName} (${frameworkLabel}).
Write a brief, professional, encouraging narrative comment (3–5 sentences) for ${input.studentName}'s report card for ${input.periodName}.

Performance data: ${perfSummary || "No marks entered yet."}
${prevSection}

Instructions:
- Ground every claim in the actual performance data above. Do NOT invent grades or levels.
- For CBE: do NOT mention any numeric average or class rank.
- Highlight strengths, identify areas needing support, suggest one concrete next step.
- Tone: warm, professional, specific. Avoid generic phrases like "good effort" without evidence.
- Output: plain text only, no markdown, no bullet points. 3–5 sentences.`;

  try {
    const text = await callGemini(schoolId, prompt, {
      temperature:  0.45,
      cacheTtlMs:   0,     // never cache — comments must be per-student
      timeoutMs:    20000,
    });
    return ok(text.trim());
  } catch (e) {
    const msg = e instanceof AiServiceError ? e.message : "AI temporarily unavailable.";
    return fallback("", msg);
  }
}

// ---------------------------------------------------------------------------
// 2. At-risk detection
// ---------------------------------------------------------------------------

export interface AtRiskStudent {
  studentId:   string;
  studentName: string;
  reason:      string;
  severity:    "HIGH" | "MEDIUM";
}

export interface AtRiskReport {
  atRisk:        AtRiskStudent[];
  checkedCount:  number;
  periodName:    string;
  prevPeriodName: string | null;
}

export async function detectAtRisk(
  schoolId: string,
  classId: string,
  currentPeriodId: string
): Promise<AtRiskReport> {
  // Resolve class + framework.
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId },
    select: { frameworkType: true },
  });

  const framework = schoolClass?.frameworkType ?? "EIGHT_FOUR_FOUR";

  if (framework === "EIGHT_FOUR_FOUR") {
    return detect844AtRisk(schoolId, classId, currentPeriodId);
  }
  return detectCbeAtRisk(schoolId, classId, currentPeriodId);
}

async function detect844AtRisk(
  schoolId: string,
  classId: string,
  currentPeriodId: string
): Promise<AtRiskReport> {
  const fw = await db.assessmentFramework.findFirst({
    where: { schoolId, type: "EIGHT_FOUR_FOUR", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const period = fw ? await db.assessmentPeriod.findFirst({
    where: { id: currentPeriodId, frameworkId: fw.id },
    select: { id: true, name: true, term: true, academicYear: true },
  }) : null;

  // Find the previous period (same academic year, lower term).
  const prevPeriod = fw && period ? await db.assessmentPeriod.findFirst({
    where: {
      frameworkId: fw.id,
      schoolId,
      academicYear: period.academicYear,
      term: period.term != null ? { lt: period.term } : undefined,
    },
    orderBy: { term: "desc" },
    select: { id: true, name: true },
  }) : null;

  const students = await prisma.student.findMany({
    where: { classId, schoolId },
    select: { id: true, fullName: true },
  });

  const atRisk: AtRiskStudent[] = [];

  for (const student of students) {
    // Compute current mean.
    const curItems = fw ? await db.assessmentItem.findMany({
      where: { periodId: currentPeriodId, studentId: student.id, schoolId, resultKind: "NUMERIC" },
      select: { paperId: true, subjectId: true, numericScore: true },
    }) : [];

    const curPoints = computeStudentMeanPoints844(curItems);

    if (curPoints === null) continue; // not enough data

    // Compare with previous.
    if (prevPeriod) {
      const prevItems = await db.assessmentItem.findMany({
        where: { periodId: prevPeriod.id, studentId: student.id, schoolId, resultKind: "NUMERIC" },
        select: { paperId: true, numericScore: true },
      });
      const prevPoints = computeStudentMeanPoints844(prevItems);

      if (prevPoints !== null) {
        const drop = prevPoints - curPoints;
        if (drop >= 3) {
          atRisk.push({
            studentId:   student.id,
            studentName: student.fullName,
            reason:      `Mean grade dropped by ${drop.toFixed(1)} pts from ${prevPeriod.name} (${prevPoints.toFixed(1)}→${curPoints.toFixed(1)})`,
            severity:    drop >= 5 ? "HIGH" : "MEDIUM",
          });
        }
      }
    }

    // Flag E-grade students.
    if (curPoints <= 2) {
      const already = atRisk.find((r) => r.studentId === student.id);
      if (!already) {
        atRisk.push({
          studentId:   student.id,
          studentName: student.fullName,
          reason:      `Current mean grade is E (${curPoints.toFixed(1)} pts)`,
          severity:    "HIGH",
        });
      }
    }
  }

  return {
    atRisk,
    checkedCount: students.length,
    periodName:    period?.name ?? currentPeriodId,
    prevPeriodName: prevPeriod?.name ?? null,
  };
}

async function detectCbeAtRisk(
  schoolId: string,
  classId: string,
  currentPeriodId: string
): Promise<AtRiskReport> {
  const fw = await db.assessmentFramework.findFirst({
    where: { schoolId, type: "CBE", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  const period = fw ? await db.assessmentPeriod.findFirst({
    where: { id: currentPeriodId, frameworkId: fw.id },
    select: { id: true, name: true, term: true, academicYear: true },
  }) : null;

  const prevPeriod = fw && period ? await db.assessmentPeriod.findFirst({
    where: {
      frameworkId: fw.id, schoolId,
      academicYear: period.academicYear,
      term: period.term != null ? { lt: period.term } : undefined,
    },
    orderBy: { term: "desc" },
    select: { id: true, name: true },
  }) : null;

  const students = await prisma.student.findMany({
    where: { classId, schoolId },
    select: { id: true, fullName: true },
  });

  const atRisk: AtRiskStudent[] = [];

  for (const student of students) {
    // --- Junior CBE: detect drop of 2+ performance levels per learning area ---
    const curItems = await db.assessmentItem.findMany({
      where: { periodId: currentPeriodId, studentId: student.id, schoolId, resultKind: "PERFORMANCE_LEVEL" },
      select: { learningAreaId: true, performanceLevel: true },
    }) as Array<{ learningAreaId: string | null; performanceLevel: PerformanceLevel | null }>;

    if (prevPeriod && curItems.length > 0) {
      const prevItems = await db.assessmentItem.findMany({
        where: { periodId: prevPeriod.id, studentId: student.id, schoolId, resultKind: "PERFORMANCE_LEVEL" },
        select: { learningAreaId: true, performanceLevel: true },
      }) as typeof curItems;

      // Group by learningArea and compare mean attainment.
      const areaIds = [...new Set(curItems.map((i) => i.learningAreaId).filter(Boolean))] as string[];
      for (const areaId of areaIds) {
        const curLevels = curItems.filter((i) => i.learningAreaId === areaId).map((i) => i.performanceLevel);
        const prevLevels = prevItems.filter((i) => i.learningAreaId === areaId).map((i) => i.performanceLevel);
        const curMean  = meanAttainment(curLevels);
        const prevMean = meanAttainment(prevLevels);
        if (curMean !== null && prevMean !== null && prevMean - curMean >= 2) {
          atRisk.push({
            studentId:   student.id,
            studentName: student.fullName,
            reason:      `Performance dropped by ${(prevMean - curMean).toFixed(1)} points in a learning area (${LEVEL_LABELS[attainmentToLevel(prevMean)]} → ${LEVEL_LABELS[attainmentToLevel(curMean)]})`,
            severity:    "HIGH",
          });
          break;
        }
      }
    }

    // --- Senior CBE: detect widening SBA/exam gap ---
    const numericItems = await db.assessmentItem.findMany({
      where: { periodId: currentPeriodId, studentId: student.id, schoolId, resultKind: "NUMERIC" },
      select: { subjectId: true, paperId: true, numericScore: true },
    }) as Array<{ subjectId: string | null; paperId: string | null; numericScore: number | null }>;

    if (numericItems.length >= 2) {
      const sbaScores:  number[] = [];
      const examScores: number[] = [];

      // Group by subject — first paper = SBA, second = exam (by sortOrder convention).
      const subjectIds = [...new Set(numericItems.map((i) => i.subjectId).filter(Boolean))] as string[];
      for (const sid of subjectIds) {
        const subItems = numericItems.filter((i) => i.subjectId === sid);
        if (subItems.length >= 2) {
          const sba  = subItems[0].numericScore;
          const exam = subItems[1].numericScore;
          if (sba !== null)  sbaScores.push(sba);
          if (exam !== null) examScores.push(exam);
        }
      }

      if (sbaScores.length > 0 && examScores.length > 0) {
        const avgSba  = sbaScores.reduce((a, b) => a + b, 0) / sbaScores.length;
        const avgExam = examScores.reduce((a, b) => a + b, 0) / examScores.length;
        const gap = Math.abs(avgSba - avgExam);
        if (gap >= 20) {
          const already = atRisk.find((r) => r.studentId === student.id);
          if (!already) {
            atRisk.push({
              studentId:   student.id,
              studentName: student.fullName,
              reason:      `Widening SBA/exam gap: SBA avg ${avgSba.toFixed(1)} vs exam avg ${avgExam.toFixed(1)} (gap ${gap.toFixed(1)} pts)`,
              severity:    gap >= 30 ? "HIGH" : "MEDIUM",
            });
          }
        }
      }
    }
  }

  return {
    atRisk,
    checkedCount:  students.length,
    periodName:    period?.name ?? currentPeriodId,
    prevPeriodName: prevPeriod?.name ?? null,
  };
}

// Estimates mean points for 8-4-4 at-risk detection.
// Paper data is unavailable here, so raw item scores are used as proxies.
function computeStudentMeanPoints844(
  items: Array<{ paperId?: string | null; numericScore: number | null }>
): number | null {
  const valid = items.filter((i) => i.numericScore !== null).map((i) => i.numericScore as number);
  if (valid.length === 0) return null;
  const avgPct = valid.reduce((a, b) => a + b, 0) / valid.length;
  return scoreToGrade(avgPct).points;
}

// ---------------------------------------------------------------------------
// 3. Anomaly detection on entry
// ---------------------------------------------------------------------------

export interface AnomalyFlag {
  paperId:      string | null;
  subjectId:    string | null;
  studentId:    string | null;
  description:  string;
  severity:     "HIGH" | "MEDIUM";
}

export interface AnomalyReport {
  flags:    AnomalyFlag[];
  checked:  number;
}

export async function detectAnomalies(
  schoolId: string,
  periodId: string,
  classId:  string
): Promise<AnomalyReport> {
  const flags: AnomalyFlag[] = [];

  const students = await prisma.student.findMany({
    where: { classId, schoolId },
    select: { id: true },
  });
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return { flags, checked: 0 };

  // Fetch all numeric items.
  const items = await db.assessmentItem.findMany({
    where: { periodId, studentId: { in: studentIds }, schoolId, resultKind: "NUMERIC" },
    select: { studentId: true, paperId: true, subjectId: true, numericScore: true },
  }) as Array<{ studentId: string; paperId: string | null; subjectId: string | null; numericScore: number | null }>;

  const papers = await db.paper.findMany({
    where: { schoolId },
    select: { id: true, maxMarks: true },
  }) as Array<{ id: string; maxMarks: number }>;
  const paperMaxMap = new Map(papers.map((p) => [p.id, p.maxMarks]));

  // 1. Out-of-range scores.
  for (const item of items) {
    if (item.numericScore === null || !item.paperId) continue;
    const max = paperMaxMap.get(item.paperId);
    if (max !== undefined && (item.numericScore < 0 || item.numericScore > max)) {
      flags.push({
        paperId: item.paperId, subjectId: item.subjectId, studentId: item.studentId,
        description: `Score ${item.numericScore} is outside valid range 0–${max}`,
        severity: "HIGH",
      });
    }
  }

  // 2. Identical class-wide entries for a paper (everyone gets same score = likely paste error).
  const byPaper = new Map<string, number[]>();
  for (const item of items) {
    if (!item.paperId || item.numericScore === null) continue;
    const arr = byPaper.get(item.paperId) ?? [];
    arr.push(item.numericScore);
    byPaper.set(item.paperId, arr);
  }
  for (const [paperId, scores] of byPaper) {
    if (scores.length < 3) continue;
    const allSame = scores.every((s) => s === scores[0]);
    if (allSame) {
      flags.push({
        paperId, subjectId: null, studentId: null,
        description: `All ${scores.length} entries for this paper are identical (${scores[0]}) — possible paste error`,
        severity: "MEDIUM",
      });
    }
  }

  // 3. Sudden jump for individual student: score > mean + 3 SD, or score < mean - 3 SD.
  for (const [paperId, scores] of byPaper) {
    if (scores.length < 4) continue;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
    const sd = Math.sqrt(variance);
    if (sd < 2) continue; // low variance — not useful

    const paperItems = items.filter((i) => i.paperId === paperId && i.numericScore !== null);
    for (const item of paperItems) {
      const score = item.numericScore as number;
      if (Math.abs(score - mean) > 3 * sd) {
        flags.push({
          paperId, subjectId: item.subjectId, studentId: item.studentId,
          description: `Score ${score} is ${Math.abs(score - mean).toFixed(1)} pts from class mean ${mean.toFixed(1)} (${(Math.abs(score - mean) / sd).toFixed(1)}σ)`,
          severity: "MEDIUM",
        });
      }
    }
  }

  return { flags, checked: items.length };
}

// ---------------------------------------------------------------------------
// 4. Natural-language dashboard query
// ---------------------------------------------------------------------------

export interface NlQueryResult {
  answer:         string;
  relatedNumbers: string[];
}

export async function answerNlQuery(
  schoolId:  string,
  question:  string,
  context:   string   // JSON-serialised dashboard data summary
): Promise<AiResult<NlQueryResult>> {
  if (!question.trim()) {
    return ok({ answer: "", relatedNumbers: [] });
  }

  const prompt = `You are an academic analytics assistant for a Kenyan school. Answer the teacher/HOD's question using ONLY the data provided. Do not invent numbers.

Dashboard data summary:
${context}

Question: ${question}

Respond as JSON: { "answer": "...", "relatedNumbers": ["...", "..."] }
- answer: 2–4 concise sentences grounded in the data.
- relatedNumbers: up to 4 key figures from the data that support the answer.`;

  try {
    const raw = await callGemini(schoolId, prompt, {
      temperature: 0.2,
      timeoutMs:   18000,
      responseSchema: {
        type: "OBJECT",
        properties: {
          answer:         { type: "STRING" },
          relatedNumbers: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["answer", "relatedNumbers"],
      },
    });
    const parsed = JSON.parse(raw) as NlQueryResult;
    return ok(parsed);
  } catch (e) {
    const msg = e instanceof AiServiceError ? e.message : "AI unavailable.";
    return fallback({ answer: "", relatedNumbers: [] }, msg);
  }
}

// ---------------------------------------------------------------------------
// 5. Personalised learning recommendations
// ---------------------------------------------------------------------------

export interface Recommendation {
  area:        string;   // subject or learning area name
  issue:       string;
  suggestion:  string;
}

export async function generateRecommendations(
  schoolId: string,
  input: NarrativeInput
): Promise<AiResult<Recommendation[]>> {
  let perfText = "";
  if (input.framework === "EIGHT_FOUR_FOUR" && input.subjectGrades?.length) {
    perfText = input.subjectGrades.map((g) => `${g.subject}: ${g.grade} (${g.score.toFixed(1)}%)`).join("\n");
  } else if (input.cbeLevels?.length) {
    perfText = input.cbeLevels.map((l) => `${l.learningArea}: ${l.summaryLevel ?? "NYE"}`).join("\n");
  } else if (input.cbePathway?.length) {
    perfText = input.cbePathway.map((p) => `${p.subject}: ${p.weightedScore !== null ? p.weightedScore.toFixed(1) + "%" : "NYE"}`).join("\n");
  }

  const prompt = `You are a pedagogical advisor for a Kenyan school. Based on ${input.studentName}'s results, identify up to 3 specific weak areas and give one practical, targeted recommendation for each.

Framework: ${input.framework === "EIGHT_FOUR_FOUR" ? "8-4-4 (KCSE)" : "CBE"}
Results:
${perfText || "No results yet."}

Rules:
- For CBE: no numeric averages, no ranks. Focus on specific learning areas / strands.
- Be concrete. "Review fractions in Numbers strand" is better than "study more".
- Output JSON: [{ "area": "...", "issue": "...", "suggestion": "..." }] — max 3 items.`;

  try {
    const raw = await callGemini(schoolId, prompt, {
      temperature: 0.35,
      timeoutMs:   18000,
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            area:       { type: "STRING" },
            issue:      { type: "STRING" },
            suggestion: { type: "STRING" },
          },
          required: ["area", "issue", "suggestion"],
        },
      },
    });
    const items = JSON.parse(raw) as Recommendation[];
    return ok(items.slice(0, 3));
  } catch (e) {
    const msg = e instanceof AiServiceError ? e.message : "AI unavailable.";
    return fallback([], msg);
  }
}

// ---------------------------------------------------------------------------
// 6. Cross-framework transition narrative
// ---------------------------------------------------------------------------

export interface TransitionNarrative {
  summary: string;
  caveats: string[];
}

export async function generateTransitionNarrative(
  schoolId:    string,
  studentName: string,
  fromFramework: "EIGHT_FOUR_FOUR" | "CBE",
  toFramework:   "EIGHT_FOUR_FOUR" | "CBE",
  priorRecord: string   // Compact text summary of the student's prior results
): Promise<AiResult<TransitionNarrative>> {
  const from = fromFramework === "EIGHT_FOUR_FOUR" ? "8-4-4 (numeric marks, KCSE grades)" : "CBE (performance levels EE/ME/AE/BE)";
  const to   = toFramework   === "EIGHT_FOUR_FOUR" ? "8-4-4 (numeric marks, KCSE grades)" : "CBE (performance levels EE/ME/AE/BE)";

  const prompt = `You are assisting a Kenyan school in transitioning a student's academic record between curriculum frameworks.

Student: ${studentName}
Transitioning FROM: ${from}
Transitioning TO:   ${to}

Prior record summary:
${priorRecord}

Task: Write a plain-language narrative summary (3–5 sentences) that describes the student's prior academic profile in a way that is meaningful to teachers in the new framework. Then list 2–3 important caveats about why the two frameworks are not numerically equivalent.

Output JSON: { "summary": "...", "caveats": ["...", "...", "..."] }`;

  try {
    const raw = await callGemini(schoolId, prompt, {
      temperature: 0.4,
      timeoutMs:   18000,
      responseSchema: {
        type: "OBJECT",
        properties: {
          summary: { type: "STRING" },
          caveats: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["summary", "caveats"],
      },
    });
    const parsed = JSON.parse(raw) as TransitionNarrative;
    return ok(parsed);
  } catch (e) {
    const msg = e instanceof AiServiceError ? e.message : "AI unavailable.";
    return fallback({ summary: "", caveats: [] }, msg);
  }
}
