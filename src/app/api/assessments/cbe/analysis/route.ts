import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import { resolveActiveFramework } from "@/lib/assessment/resolveFramework";
import { computeSubjectMark } from "@/lib/assessment/subjectMark";
import { loadFormulaResolvers, NO_FORMULAS, type FormulaResolver } from "@/lib/assessment/subjectMarkFormulas";
import { resolveScale, type GradeBand } from "@/lib/assessment/gradingScale";
import {
  CLASS_LABEL_SELECT, classLevelLabel, fallbackLevelLabel,
} from "@/lib/curriculum/classLabels";

/**
 * GET /api/assessments/cbe/analysis?periodId=&classId=&form=&subjectId=
 *
 * The CBE counterpart of /api/assessments/dashboard. It returns exactly the
 * same shape of analysis the 8-4-4 dashboard does — overall summary, subject
 * means, class comparison, per-student scorecard, trend, subject × class
 * heat-map — with two deliberate differences:
 *
 *   1. Everything is expressed in RAW MARKS out of 100. A learner who scored
 *      80 is reported as 80; no points scale is involved anywhere.
 *   2. Where 8-4-4 shows a letter grade (A, B, …), CBE shows the achievement
 *      band from the school's active CBE grading scale (EE1, EE2, ME1, …),
 *      falling back to the KNEC government default.
 *
 * There is no junior/senior split: a CBE class is a CBE class.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const STUDENT_LIMIT = 5_000;

type PeriodRow = { id: string; name: string; academicYear: string; term: number | null };
type PaperRow  = { id: string; subjectId: string; name: string; maxMarks: number };
type ItemRow   = { studentId: string; subjectId: string | null; paperId: string | null; numericScore: number | null };
type TrendItemRow = ItemRow & { periodId: string };

export async function GET(req: NextRequest) {
  try {
    return await analysisHandler(req);
  } catch (err) {
    console.error("[cbe/analysis] unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/** Sort bands high → low and resolve a mark (0–100) to one of them. */
function makeBandResolver(bands: GradeBand[]) {
  const sorted = [...bands].sort((a, b) => b.minPercentage - a.minPercentage);
  return function bandFor(mark: number | null): string | null {
    if (mark === null || sorted.length === 0) return null;
    const clamped = Math.max(0, Math.min(100, mark));
    const band = sorted.find((b) => clamped >= b.minPercentage);
    return (band ?? sorted[sorted.length - 1]).bandName;
  };
}

async function analysisHandler(req: NextRequest) {
  const params    = req.nextUrl.searchParams;
  const periodId  = params.get("periodId");
  const classId   = params.get("classId")   ?? undefined;
  const subjectId = params.get("subjectId") ?? undefined;
  const formParam = params.get("form");
  const form      = formParam ? parseInt(formParam, 10) : undefined;

  if (!periodId) {
    return NextResponse.json({ error: "periodId is required." }, { status: 400 });
  }
  if (form !== undefined && isNaN(form)) {
    return NextResponse.json({ error: "form must be a number." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const classWhere: Record<string, unknown> = { schoolId: user.schoolId!, frameworkType: "CBE" };
  if (classId)            classWhere.id   = classId;
  if (form !== undefined) classWhere.form = form;

  const [actor, period, classes, framework, scale] = await Promise.all([
    resolveAssessmentActor(user, user.schoolId!),
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId: user.schoolId! },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as Promise<PeriodRow | null>,
    prisma.schoolClass.findMany({
      where: classWhere,
      orderBy: [{ form: "asc" }, { name: "asc" }],
      select: { ...CLASS_LABEL_SELECT },
    }),
    resolveActiveFramework(user.schoolId!, "CBE"),
    resolveScale(user.schoolId!),
  ]);

  if (!canAccessDashboard(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!period)    return NextResponse.json({ error: "Period not found." }, { status: 404 });
  if (!framework) return NextResponse.json({ error: "No active CBE framework found." }, { status: 404 });

  const bandFor = makeBandResolver(scale.bands);
  const bandNames = [...scale.bands]
    .sort((a, b) => b.minPercentage - a.minPercentage)
    .map((b) => b.bandName);
  const topBand    = bandNames[0] ?? null;
  const bottomBand = bandNames[bandNames.length - 1] ?? null;

  const filters = { periodId, classId, subjectId, form };
  const classIds = classes.map((c) => c.id);
  if (classIds.length === 0) return emptyAnalysis(filters, bandNames);

  // Expand the heat-map to sibling classes of the same form when one class is
  // selected — same behaviour as the 8-4-4 dashboard.
  let heatmapClasses  = classes;
  let heatmapClassIds = classIds;

  const needsSiblings = Boolean(classId) && classes.length === 1;
  const [siblings, students] = await Promise.all([
    needsSiblings
      ? prisma.schoolClass.findMany({
          where: { schoolId: user.schoolId!, frameworkType: "CBE", form: classes[0].form },
          orderBy: [{ name: "asc" }],
          select: { ...CLASS_LABEL_SELECT },
        })
      : Promise.resolve(null),
    prisma.student.findMany({
      where: { classId: { in: classIds }, schoolId: user.schoolId! },
      orderBy: [{ classId: "asc" }, { fullName: "asc" }],
      select: { id: true, fullName: true, admissionNumber: true, classId: true },
      take: STUDENT_LIMIT,
    }),
  ]);

  if (siblings) {
    heatmapClasses  = siblings;
    heatmapClassIds = siblings.map((c) => c.id);
  }

  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return emptyAnalysis(filters, bandNames);

  const papersWhere: Record<string, unknown>   = { schoolId: user.schoolId!, frameworkId: framework.id };
  const subjectsWhere: Record<string, unknown> = { schoolId: user.schoolId! };
  if (subjectId) { papersWhere.subjectId = subjectId; subjectsWhere.id = subjectId; }

  const [papers, subjects, allPeriods] = await Promise.all([
    db.paper.findMany({
      where: papersWhere,
      orderBy: { sortOrder: "asc" },
      select: { id: true, subjectId: true, name: true, maxMarks: true },
    }) as Promise<PaperRow[]>,
    prisma.subject.findMany({
      where: subjectsWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    db.assessmentPeriod.findMany({
      where: { schoolId: user.schoolId! },
      orderBy: [{ term: "asc" }, { name: "asc" }],
      select: { id: true, name: true, academicYear: true, term: true },
    }) as Promise<PeriodRow[]>,
  ]);

  const itemsWhere: Record<string, unknown> = {
    studentId:  { in: studentIds },
    periodId,
    schoolId:   user.schoolId!,
    resultKind: "NUMERIC",
  };
  if (subjectId) itemsWhere.subjectId = subjectId;

  const allPeriodIds = allPeriods.map((p) => p.id);

  const [formulaResolvers, items, trendItems] = await Promise.all([
    loadFormulaResolvers(user.schoolId!, allPeriodIds.length > 0 ? allPeriodIds : [periodId]),
    db.assessmentItem.findMany({
      where: itemsWhere,
      select: { studentId: true, subjectId: true, paperId: true, numericScore: true },
    }) as Promise<ItemRow[]>,
    allPeriodIds.length > 0
      ? db.assessmentItem.findMany({
          where: {
            periodId:   { in: allPeriodIds },
            studentId:  { in: studentIds },
            schoolId:   user.schoolId!,
            resultKind: "NUMERIC",
          },
          select: { periodId: true, studentId: true, subjectId: true, paperId: true, numericScore: true },
        }) as Promise<TrendItemRow[]>
      : Promise.resolve([] as TrendItemRow[]),
  ]);

  const papersBySubject = new Map<string, Array<{ id: string; name: string; maxMarks: number }>>();
  for (const p of papers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push({ id: p.id, name: p.name, maxMarks: p.maxMarks });
    papersBySubject.set(p.subjectId, arr);
  }

  const markByPaper   = new Map<string, number>();
  const markBySubject = new Map<string, number>();
  for (const item of items) {
    if (item.numericScore === null) continue;
    if (item.paperId) markByPaper.set(`${item.studentId}:${item.paperId}`, item.numericScore);
    else if (item.subjectId) markBySubject.set(`${item.studentId}:${item.subjectId}`, item.numericScore);
  }

  /**
   * A learner's mark for one subject — resolved exactly as the mark sheet
   * resolves it, so the two screens never disagree:
   *
   *   • Subjects with no papers configured take the subject-level score
   *     verbatim. That is how a raw 80 stays an 80.
   *   • Subjects with papers go through computeSubjectMark, which applies the
   *     department's formula for this (subject, class level, period) when one
   *     is set and totals the papers otherwise.
   */
  function markFor(
    studentId: string,
    subjId: string,
    form: number,
    formulaFor: FormulaResolver,
    byPaper: Map<string, number | null>,
    bySubject: Map<string, number | null>
  ): number | null {
    const sPapers = papersBySubject.get(subjId) ?? [];
    if (sPapers.length === 0) {
      const v = bySubject.get(`${studentId}:${subjId}`);
      return v === undefined || v === null ? null : v;
    }
    const scores = sPapers.map((p) => {
      const v = byPaper.get(`${studentId}:${p.id}`);
      return v === undefined ? null : v;
    });
    return computeSubjectMark(sPapers, scores, formulaFor(subjId, form));
  }

  const formulaFor = formulaResolvers.get(periodId) ?? NO_FORMULAS;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const mean   = (xs: number[]) => (xs.length === 0 ? null : round2(xs.reduce((a, b) => a + b, 0) / xs.length));

  // ── Per student × subject marks ───────────────────────────────────────────
  type Result = { studentId: string; classId: string; subjectId: string; mark: number | null };
  const studentClassMap = new Map(students.map((s) => [s.id, s.classId]));
  // Formulas are scoped to a class LEVEL, so every stream at that level shares
  // one formula — map each learner to their class's form.
  const formByClass = new Map<string, number>([
    ...classes.map((c) => [c.id, c.form] as const),
    ...heatmapClasses.map((c) => [c.id, c.form] as const),
  ]);
  const formOf = (sid: string) => formByClass.get(studentClassMap.get(sid) ?? "") ?? 0;

  const results: Result[] = [];
  for (const s of subjects) {
    for (const student of students) {
      results.push({
        studentId: student.id,
        classId:   studentClassMap.get(student.id)!,
        subjectId: s.id,
        mark:      markFor(student.id, s.id, formOf(student.id), formulaFor, markByPaper, markBySubject),
      });
    }
  }

  if (!results.some((r) => r.mark !== null)) return emptyAnalysis(filters, bandNames);

  // ── Subject performance (mean raw marks) ──────────────────────────────────
  const subjectPerformance = subjects.map((s) => {
    const marks = results.filter((r) => r.subjectId === s.id && r.mark !== null).map((r) => r.mark!);
    const m = mean(marks);
    return { subject: s, meanMark: m, band: bandFor(m), studentCount: marks.length };
  });

  // ── Per-student overall mean mark ─────────────────────────────────────────
  const marksByStudent = new Map<string, number[]>();
  for (const r of results) {
    if (r.mark === null) continue;
    const arr = marksByStudent.get(r.studentId) ?? [];
    arr.push(r.mark);
    marksByStudent.set(r.studentId, arr);
  }
  const studentMean = new Map<string, number>();
  for (const [sid, marks] of marksByStudent) {
    const m = mean(marks);
    if (m !== null) studentMean.set(sid, m);
  }

  const classNameMap = new Map(classes.map((c) => [c.id, c.name]));

  // ── Band distribution + the learners behind each bar ──────────────────────
  const bandStudents: Record<string, Array<{ admissionNumber: string; fullName: string; className: string; meanMark: number }>> = {};
  for (const name of bandNames) bandStudents[name] = [];
  for (const student of students) {
    const m = studentMean.get(student.id);
    if (m === undefined) continue;
    const band = bandFor(m);
    if (!band || !bandStudents[band]) continue;
    bandStudents[band].push({
      admissionNumber: student.admissionNumber,
      fullName:        student.fullName,
      className:       classNameMap.get(student.classId) ?? "—",
      meanMark:        m,
    });
  }
  for (const name of bandNames) bandStudents[name].sort((a, b) => b.meanMark - a.meanMark);
  const bandDistribution = bandNames.map((name) => ({ band: name, count: bandStudents[name].length }));

  // ── Class comparison ──────────────────────────────────────────────────────
  const studentsByClass = new Map<string, typeof students>();
  for (const student of students) {
    const arr = studentsByClass.get(student.classId) ?? [];
    arr.push(student);
    studentsByClass.set(student.classId, arr);
  }

  const classComparison = classes.map((cls) => {
    const cs    = studentsByClass.get(cls.id) ?? [];
    const means = cs.map((s) => studentMean.get(s.id)).filter((v): v is number => v !== undefined);
    const m     = mean(means);
    return {
      schoolClass:  cls,
      meanMark:     m,
      band:         bandFor(m),
      countTop:     topBand    ? means.filter((v) => bandFor(v) === topBand).length    : 0,
      countBottom:  bottomBand ? means.filter((v) => bandFor(v) === bottomBand).length : 0,
      studentCount: cs.length,
    };
  });

  const allMeans = [...studentMean.values()];
  const overallMeanMark = mean(allMeans);

  // ── Trend across every period ─────────────────────────────────────────────
  const trendByPaper   = new Map<string, Map<string, number | null>>();
  const trendBySubject = new Map<string, Map<string, number | null>>();
  for (const item of trendItems) {
    if (item.paperId) {
      let m = trendByPaper.get(item.periodId);
      if (!m) { m = new Map(); trendByPaper.set(item.periodId, m); }
      m.set(`${item.studentId}:${item.paperId}`, item.numericScore);
    } else if (item.subjectId) {
      let m = trendBySubject.get(item.periodId);
      if (!m) { m = new Map(); trendBySubject.set(item.periodId, m); }
      m.set(`${item.studentId}:${item.subjectId}`, item.numericScore);
    }
  }

  const trendData = allPeriods.map((p) => {
    const byPaper   = trendByPaper.get(p.id)   ?? new Map<string, number | null>();
    const bySubject = trendBySubject.get(p.id) ?? new Map<string, number | null>();
    const periodFormulaFor = formulaResolvers.get(p.id) ?? NO_FORMULAS;
    const perStudent = students
      .map((student) => {
        const marks = subjects
          .map((s) => markFor(student.id, s.id, formOf(student.id), periodFormulaFor, byPaper, bySubject))
          .filter((v): v is number => v !== null);
        return mean(marks);
      })
      .filter((v): v is number => v !== null);
    return { period: p, meanMark: mean(perStudent) };
  });

  // ── Subject × class heat-map (mean raw marks) ─────────────────────────────
  const heatAcc = new Map<string, { sum: number; count: number }>();
  for (const r of results) {
    if (r.mark === null) continue;
    const key  = `${r.subjectId}:${r.classId}`;
    const cell = heatAcc.get(key) ?? { sum: 0, count: 0 };
    cell.sum += r.mark;
    cell.count += 1;
    heatAcc.set(key, cell);
  }

  const extraClassIds = heatmapClassIds.filter((id) => !classIds.includes(id));
  if (extraClassIds.length > 0) {
    const extraStudents = await prisma.student.findMany({
      where: { classId: { in: extraClassIds }, schoolId: user.schoolId! },
      select: { id: true, classId: true },
      take: STUDENT_LIMIT,
    });
    if (extraStudents.length > 0) {
      const extraWhere: Record<string, unknown> = {
        studentId:  { in: extraStudents.map((s) => s.id) },
        periodId,
        schoolId:   user.schoolId!,
        resultKind: "NUMERIC",
      };
      if (subjectId) extraWhere.subjectId = subjectId;
      const extraItems: ItemRow[] = await db.assessmentItem.findMany({
        where: extraWhere,
        select: { studentId: true, subjectId: true, paperId: true, numericScore: true },
      });

      const extraByPaper   = new Map<string, number | null>();
      const extraBySubject = new Map<string, number | null>();
      for (const item of extraItems) {
        if (item.numericScore === null) continue;
        if (item.paperId) extraByPaper.set(`${item.studentId}:${item.paperId}`, item.numericScore);
        else if (item.subjectId) extraBySubject.set(`${item.studentId}:${item.subjectId}`, item.numericScore);
      }

      for (const s of subjects) {
        for (const student of extraStudents) {
          const extraForm = formByClass.get(student.classId) ?? 0;
          const markVal = markFor(student.id, s.id, extraForm, formulaFor, extraByPaper, extraBySubject);
          if (markVal === null) continue;
          const key  = `${s.id}:${student.classId}`;
          const cell = heatAcc.get(key) ?? { sum: 0, count: 0 };
          cell.sum += markVal;
          cell.count += 1;
          heatAcc.set(key, cell);
        }
      }
    }
  }

  const subjectClassHeatmap = subjects.map((s) => {
    const cells = heatmapClasses.map((cls) => {
      const cell = heatAcc.get(`${s.id}:${cls.id}`);
      const m = cell && cell.count > 0 ? round2(cell.sum / cell.count) : null;
      return { classId: cls.id, className: cls.name, meanMark: m };
    });
    const valid = cells.map((c) => c.meanMark).filter((v): v is number => v !== null);
    return { subjectId: s.id, subjectName: s.name, classes: cells, totalMeanMark: mean(valid) };
  });

  const heatmapClassSummary = heatmapClasses.map((cls) => {
    const valid = subjectClassHeatmap
      .map((row) => row.classes.find((c) => c.classId === cls.id)?.meanMark ?? null)
      .filter((v): v is number => v !== null);
    return { classId: cls.id, className: cls.name, meanMark: mean(valid) };
  });

  const summaryMarks = heatmapClassSummary.map((c) => c.meanMark).filter((v): v is number => v !== null);
  const heatmapTotalSummary = summaryMarks.length > 0 ? { meanMark: mean(summaryMarks)! } : null;

  // ── Per-student scorecard (only when scoped to a class or a form) ─────────
  let scorecard: unknown = null;
  if (classId || form !== undefined) {
    const subjectHasData = new Set<string>();
    for (const r of results) if (r.mark !== null) subjectHasData.add(r.subjectId);
    const activeSubjects = subjects.filter((s) => subjectHasData.has(s.id));

    const markLookup = new Map<string, number | null>();
    for (const r of results) markLookup.set(`${r.studentId}:${r.subjectId}`, r.mark);

    const rows = students.map((student) => {
      const cells = activeSubjects.map((s) => {
        const m = markLookup.get(`${student.id}:${s.id}`) ?? null;
        return { mark: m, band: bandFor(m) };
      });
      const m = studentMean.get(student.id) ?? null;
      return {
        admissionNumber: student.admissionNumber,
        fullName:        student.fullName,
        className:       classNameMap.get(student.classId) ?? "—",
        subjects:        cells,
        meanMark:        m,
        band:            bandFor(m),
      };
    });

    rows.sort((a, b) => {
      if (a.meanMark === null && b.meanMark === null) return 0;
      if (a.meanMark === null) return 1;
      if (b.meanMark === null) return -1;
      return b.meanMark - a.meanMark;
    });

    scorecard = {
      scopeLabel: classId
        ? (classNameMap.get(classId) ?? "Class")
        // Every class here is CBE, so the level reads "Grade 11", not "Form 11".
        : (classes[0] ? classLevelLabel(classes[0]) : fallbackLevelLabel(form!, "CBE")),
      subjects:   activeSubjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
      multiClass: classIds.length > 1,
      rows,
    };
  }

  return NextResponse.json(
    {
      filters,
      bands: bandNames,
      usedDefaultScale: scale.usedDefault,
      summary: { overallMeanMark, overallBand: bandFor(overallMeanMark), studentCount: students.length },
      subjectPerformance,
      bandDistribution,
      bandStudents,
      classComparison,
      trendData,
      subjectClassHeatmap,
      heatmapClassSummary,
      heatmapTotalSummary,
      scorecard,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function emptyAnalysis(
  filters: { periodId: string; classId?: string; subjectId?: string; form?: number },
  bands: string[]
) {
  return NextResponse.json({
    filters,
    bands,
    usedDefaultScale: true,
    summary: { overallMeanMark: null, overallBand: null, studentCount: 0 },
    subjectPerformance: [],
    bandDistribution: [],
    bandStudents: {},
    classComparison: [],
    trendData: [],
    subjectClassHeatmap: [],
    heatmapClassSummary: [],
    heatmapTotalSummary: null,
    scorecard: null,
  });
}
