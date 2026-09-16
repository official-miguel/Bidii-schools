/**
 * Server-only loader for CBE subject marks across a set of periods.
 *
 * Every CBE analysis screen needs the same thing: "what mark did this learner
 * get in this subject, in this period" — resolved the way the mark sheet
 * resolves it, with papers totalled and the department's formula applied when
 * one is set. Doing that in SQL is not possible (a formula is an arbitrary
 * expression over named papers), so it is done here once, in bulk, and shared
 * rather than re-implemented per route.
 *
 * See [[marks-must-match-the-mark-sheet]]: nothing should re-derive a subject
 * mark inline from papers.
 */

import { prisma } from "@/lib/prisma";
import { resolveActiveFramework } from "@/lib/assessment/resolveFramework";
import { computeSubjectMark } from "@/lib/assessment/subjectMark";
import { loadFormulaResolvers, NO_FORMULAS } from "@/lib/assessment/subjectMarkFormulas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export type CbeStudent = { id: string; classId: string };

export interface CbeMarks {
  /** Learners in every CBE class in scope. */
  students: CbeStudent[];
  /** Subject ids that actually have marks recorded somewhere in scope. */
  subjectIdsWithData: string[];
  /** A learner's mark for one subject in one period, or null if unmarked. */
  markFor(periodId: string, studentId: string, subjectId: string): number | null;
}

const EMPTY: CbeMarks = {
  students: [],
  subjectIdsWithData: [],
  markFor: () => null,
};

/**
 * @param classes CBE classes in scope — `form` drives formula resolution, since
 *                formulas are configured per class level.
 */
export async function loadCbeMarks(
  schoolId: string,
  periodIds: string[],
  classes: Array<{ id: string; form: number }>
): Promise<CbeMarks> {
  if (periodIds.length === 0 || classes.length === 0) return EMPTY;

  const classIds = classes.map((c) => c.id);
  const formByClass = new Map(classes.map((c) => [c.id, c.form]));

  const [framework, students] = await Promise.all([
    resolveActiveFramework(schoolId, "CBE"),
    prisma.student.findMany({
      where: { classId: { in: classIds }, schoolId },
      select: { id: true, classId: true },
    }),
  ]);

  if (!framework || students.length === 0) return EMPTY;

  const [papers, formulaResolvers, items] = await Promise.all([
    db.paper.findMany({
      where: { schoolId, frameworkId: framework.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, subjectId: true, name: true, maxMarks: true },
    }) as Promise<Array<{ id: string; subjectId: string; name: string; maxMarks: number }>>,
    loadFormulaResolvers(schoolId, periodIds),
    db.assessmentItem.findMany({
      where: {
        schoolId,
        periodId:   { in: periodIds },
        studentId:  { in: students.map((s) => s.id) },
        resultKind: "NUMERIC",
      },
      select: { periodId: true, studentId: true, subjectId: true, paperId: true, numericScore: true },
    }) as Promise<Array<{ periodId: string; studentId: string; subjectId: string | null;
                          paperId: string | null; numericScore: number | null }>>,
  ]);

  const papersBySubject = new Map<string, Array<{ id: string; name: string; maxMarks: number }>>();
  const subjectByPaper  = new Map<string, string>();
  for (const p of papers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push({ id: p.id, name: p.name, maxMarks: p.maxMarks });
    papersBySubject.set(p.subjectId, arr);
    subjectByPaper.set(p.id, p.subjectId);
  }

  const byPaper   = new Map<string, Map<string, number>>();
  const bySubject = new Map<string, Map<string, number>>();
  const subjectIdsWithData = new Set<string>();
  for (const item of items) {
    if (item.numericScore === null) continue;
    if (item.paperId) {
      let m = byPaper.get(item.periodId);
      if (!m) { m = new Map(); byPaper.set(item.periodId, m); }
      m.set(`${item.studentId}:${item.paperId}`, item.numericScore);
      const sid = subjectByPaper.get(item.paperId);
      if (sid) subjectIdsWithData.add(sid);
    } else if (item.subjectId) {
      let m = bySubject.get(item.periodId);
      if (!m) { m = new Map(); bySubject.set(item.periodId, m); }
      m.set(`${item.studentId}:${item.subjectId}`, item.numericScore);
      subjectIdsWithData.add(item.subjectId);
    }
  }

  const formByStudent = new Map(
    students.map((s) => [s.id, formByClass.get(s.classId) ?? 0])
  );

  function markFor(periodId: string, studentId: string, subjectId: string): number | null {
    const sPapers = papersBySubject.get(subjectId) ?? [];
    if (sPapers.length === 0) {
      return bySubject.get(periodId)?.get(`${studentId}:${subjectId}`) ?? null;
    }
    const paperMap = byPaper.get(periodId);
    const scores = sPapers.map((p) => paperMap?.get(`${studentId}:${p.id}`) ?? null);
    const formulaFor = formulaResolvers.get(periodId) ?? NO_FORMULAS;
    return computeSubjectMark(sPapers, scores, formulaFor(subjectId, formByStudent.get(studentId) ?? 0));
  }

  return { students, subjectIdsWithData: [...subjectIdsWithData], markFor };
}
