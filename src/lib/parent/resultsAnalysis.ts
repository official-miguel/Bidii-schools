/**
 * Parent-facing Results Analysis — CBE marks and bands only. Per
 * `[CBE keeps its own grading and raw marks]`: this module always shows
 * EE1–BE2 bands and raw marks, never KCSE letters or points.
 *
 * Gated: a period only appears here once its results SMS/WhatsApp batch has
 * gone out to parents (`AssessmentPeriod.resultsSmsSentAt` set) — see
 * requirement "Analysis appear when the sms of results ... has been sent".
 *
 * SERVER-ONLY (imports Prisma).
 */

import { prisma } from "@/lib/prisma";
import { resolveCbeGrade } from "@/lib/assessment/gradingScale";

export interface SubjectAnalysis {
  subjectId:   string;
  subjectName: string;
  resultKind:  string;
  numericScore: number | null;
  performanceLevel: string | null;
  competencyStatus: string | null;
  /** CBE band (e.g. "EE1") resolved from numericScore, NUMERIC items only. */
  bandName:  string | null;
  points:    number | null;
}

export interface SubjectMovement {
  subjectId:    string;
  subjectName:  string;
  current:      SubjectAnalysis;
  previous:     SubjectAnalysis | null;
  pointsDelta:  number | null; // current.points - previous.points
  bucket:       "SIGNIFICANT_IMPROVEMENT" | "MODERATE_IMPROVEMENT" | "NO_CHANGE" | "DECLINE" | "NEW";
}

export interface PeriodAnalysis {
  period: {
    id: string;
    name: string;
    academicYear: string;
    term: number | null;
  };
  smsSentAt: string; // ISO — always non-null for entries returned here
  subjects: SubjectAnalysis[];
  movements: SubjectMovement[];
  overall: {
    meanPercentage: number;
    totalPoints: number;
    gradeBand: string | null;
  } | null;
  previousOverall: {
    totalPoints: number;
  } | null;
  counts: { improved: number; stable: number; declined: number };
  highestSubject: SubjectAnalysis | null;
}

/**
 * Builds the full, SMS-gated, period-over-period analysis for one student.
 * Only periods with `resultsSmsSentAt` set are included — the whole point of
 * the gate is that a parent never sees an analysis for results the school
 * hasn't actually told them about yet.
 */
export async function getResultsAnalysis(
  schoolId: string,
  studentId: string
): Promise<PeriodAnalysis[]> {
  const periods = await prisma.assessmentPeriod.findMany({
    where: { schoolId, resultsSmsSentAt: { not: null } },
    orderBy: [{ academicYear: "asc" }, { term: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, name: true, academicYear: true, term: true,
      maxMarks: true, resultsSmsSentAt: true,
    },
  });
  if (periods.length === 0) return [];

  const periodIds = periods.map((p) => p.id);
  // Subject-scoped items only (subjectId set) — this analysis renders one
  // row per subject, matching the school's subject-level report layout.
  const items = await prisma.assessmentItem.findMany({
    where: { studentId, periodId: { in: periodIds }, subjectId: { not: null } },
    select: {
      periodId: true, resultKind: true, numericScore: true,
      performanceLevel: true, competencyStatus: true,
      subjectId: true, subject: { select: { name: true } },
    },
  });

  const itemsByPeriod = new Map<string, typeof items>();
  for (const item of items) {
    const bucket = itemsByPeriod.get(item.periodId) ?? [];
    bucket.push(item);
    itemsByPeriod.set(item.periodId, bucket);
  }

  // Resolve CBE bands for every NUMERIC item up front.
  async function toSubjectAnalysis(
    item: (typeof items)[number],
    maxMarks: number
  ): Promise<SubjectAnalysis> {
    let bandName: string | null = null;
    let points: number | null = null;
    if (item.resultKind === "NUMERIC" && item.numericScore != null) {
      const grade = await resolveCbeGrade(schoolId, item.numericScore, maxMarks || 100);
      if (grade) {
        bandName = grade.bandName;
        points   = grade.points;
      }
    }
    return {
      subjectId:   item.subjectId!,
      subjectName: item.subject?.name ?? "—",
      resultKind:  item.resultKind,
      numericScore: item.numericScore,
      performanceLevel: item.performanceLevel,
      competencyStatus: item.competencyStatus,
      bandName,
      points,
    };
  }

  const perPeriodSubjects = new Map<string, SubjectAnalysis[]>();
  for (const period of periods) {
    const raw = itemsByPeriod.get(period.id) ?? [];
    const resolved = await Promise.all(raw.map((i) => toSubjectAnalysis(i, period.maxMarks ?? 100)));
    perPeriodSubjects.set(period.id, resolved);
  }

  const results: PeriodAnalysis[] = [];

  for (let idx = 0; idx < periods.length; idx++) {
    const period = periods[idx];
    const subjects = perPeriodSubjects.get(period.id) ?? [];
    const prevPeriod = idx > 0 ? periods[idx - 1] : null;
    const prevSubjects = prevPeriod ? perPeriodSubjects.get(prevPeriod.id) ?? [] : [];
    const prevBySubjectId = new Map(prevSubjects.map((s) => [s.subjectId, s]));

    const movements: SubjectMovement[] = subjects
      .filter((s) => s.points != null)
      .map((s) => {
        const previous = prevBySubjectId.get(s.subjectId) ?? null;
        const pointsDelta =
          previous?.points != null && s.points != null ? s.points - previous.points : null;

        let bucket: SubjectMovement["bucket"];
        if (previous == null || previous.points == null) bucket = "NEW";
        else if (pointsDelta == null) bucket = "NEW";
        else if (pointsDelta >= 5) bucket = "SIGNIFICANT_IMPROVEMENT";
        else if (pointsDelta >= 1) bucket = "MODERATE_IMPROVEMENT";
        else if (pointsDelta === 0) bucket = "NO_CHANGE";
        else bucket = "DECLINE";

        return { subjectId: s.subjectId, subjectName: s.subjectName, current: s, previous, pointsDelta, bucket };
      });

    const numericScores = subjects.map((s) => s.numericScore).filter((n): n is number => n != null);
    const meanPercentage = numericScores.length
      ? +((numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(1))
      : 0;
    const totalPoints = subjects.reduce((sum, s) => sum + (s.points ?? 0), 0);
    const overallGrade = numericScores.length
      ? await resolveCbeGrade(schoolId, meanPercentage, 100)
      : null;

    const prevTotalPoints = prevSubjects.length
      ? prevSubjects.reduce((sum, s) => sum + (s.points ?? 0), 0)
      : null;

    const improved = movements.filter(
      (m) => m.bucket === "SIGNIFICANT_IMPROVEMENT" || m.bucket === "MODERATE_IMPROVEMENT"
    ).length;
    const stable = movements.filter((m) => m.bucket === "NO_CHANGE").length;
    const declined = movements.filter((m) => m.bucket === "DECLINE").length;

    const highestSubject = subjects.reduce<SubjectAnalysis | null>((best, s) => {
      if (s.points == null) return best;
      if (!best || (best.points ?? -1) < s.points) return s;
      return best;
    }, null);

    results.push({
      period: { id: period.id, name: period.name, academicYear: period.academicYear, term: period.term },
      smsSentAt: period.resultsSmsSentAt!.toISOString(),
      subjects,
      movements,
      overall: numericScores.length
        ? { meanPercentage, totalPoints, gradeBand: overallGrade?.bandName ?? null }
        : null,
      previousOverall: prevTotalPoints != null ? { totalPoints: prevTotalPoints } : null,
      counts: { improved, stable, declined },
      highestSubject,
    });
  }

  // Most recent period first for display.
  return results.reverse();
}
