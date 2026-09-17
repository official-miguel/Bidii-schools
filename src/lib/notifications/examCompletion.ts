/**
 * "Exam period is fully marked" analysis + notifications.
 *
 * Fires once per exam period, the moment the LAST outstanding mark for that
 * period is saved. Two audiences get told, from one shared computation so the
 * numbers they see can never disagree:
 *
 *   • Principal / full-admin — which classes have the most students failing a
 *     particular subject, so they can go and talk to that subject's teacher.
 *   • Each subject teacher     — how many of the learners they teach in a given
 *     class came out below average in their subject.
 *
 * Definition of "failing", agreed with the school: a learner fails a subject
 * when their subject mark is below the SCHOOL-WIDE mean for that subject in
 * that period. Comparing against the class's own mean would make every class
 * look identical by construction and the principal's ranking meaningless.
 *
 * Scope note: this is a numeric-marks analysis, so it only considers classes on
 * the 8-4-4 framework. CBC and CBE classes keep their own grading (performance
 * levels / competency statuses) and are deliberately excluded — both from the
 * failure analysis and from the "is the period complete?" gate, since they have
 * no papers to complete.
 *
 * Marks are resolved through computeSubjectMark() — the same function the mark
 * sheet itself uses — so the figure quoted in a notification is exactly the
 * figure the teacher typed and saw.
 */

import { prisma } from "@/lib/prisma";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import { computeSubjectMark, type FormulaPaper } from "@/lib/assessment/subjectMark";
import { loadFormulaResolvers } from "@/lib/assessment/subjectMarkFormulas";
import { resolveActiveFramework } from "@/lib/assessment/resolveFramework";
import { classDisplayName, CLASS_LABEL_SELECT } from "@/lib/curriculum/classLabels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/** How many "class × subject" hot spots the principal's notification names. */
const TOP_HOTSPOTS = 3;

export interface SubjectFailureRow {
  classId:      string;
  className:    string;
  subjectId:    string;
  subjectName:  string;
  teacherId:    string | null;
  /** Learners in this class whose subject mark is below the school mean. */
  failing:      number;
  /** Learners in this class with a resolved mark for the subject. */
  total:        number;
  /** Mean mark for this subject within this class. */
  classMean:    number;
  /** Mean mark for this subject across the whole school. */
  schoolMean:   number;
}

export interface ExamCompletionResult {
  /** False when at least one learner is still missing a mark somewhere. */
  complete:      boolean;
  /** True when this period's notifications had already been sent before. */
  alreadySent:   boolean;
  rows:          SubjectFailureRow[];
  notifiedUsers: number;
}

const NOT_COMPLETE: ExamCompletionResult = {
  complete: false, alreadySent: false, rows: [], notifiedUsers: 0,
};

/** Stable key so re-saving a mark after the fact never re-notifies anyone. */
function periodDedupKey(periodId: string): string {
  return `exam-analysis:${periodId}`;
}

/**
 * Evaluate one exam period. Safe to call on every mark save: it bails out in
 * two cheap queries when the period has already been reported, and never
 * throws — a notification must not fail the save that triggered it.
 */
export async function runExamCompletionCheck(
  schoolId: string,
  periodId: string
): Promise<ExamCompletionResult> {
  try {
    return await evaluate(schoolId, periodId);
  } catch (err) {
    console.error("[examCompletion] check failed", { schoolId, periodId }, err);
    return NOT_COMPLETE;
  }
}

async function evaluate(schoolId: string, periodId: string): Promise<ExamCompletionResult> {
  const dedupKey = periodDedupKey(periodId);

  // ── 0. Already reported? Cheapest possible exit for the common case. ──────
  const existing = await prisma.notification.count({ where: { schoolId, dedupKey } });
  if (existing > 0) return { ...NOT_COMPLETE, complete: true, alreadySent: true };

  const period = await db.assessmentPeriod.findFirst({
    where: { id: periodId, schoolId },
    select: { id: true, name: true },
  }) as { id: string; name: string } | null;
  if (!period) return NOT_COMPLETE;

  const framework = await resolveActiveFramework(schoolId, "EIGHT_FOUR_FOUR");
  if (!framework) return NOT_COMPLETE;

  // ── 1. Every 8-4-4 class that actually has learners in it. ────────────────
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId, frameworkType: "EIGHT_FOUR_FOUR" },
    select: {
      ...CLASS_LABEL_SELECT,
      students: { select: { id: true } },
      subjectTeachers: {
        select: {
          subjectId: true,
          teacherId: true,
          subject:   { select: { id: true, name: true } },
        },
      },
    },
  });

  const activeClasses = classes.filter((c) => c.students.length > 0);
  if (activeClasses.length === 0) return NOT_COMPLETE;

  // A class with no subjects assigned has nothing to complete and nothing to
  // analyse — it must not hold the whole period hostage.
  const scoredClasses = activeClasses.filter((c) => c.subjectTeachers.length > 0);
  if (scoredClasses.length === 0) return NOT_COMPLETE;

  // ── 2. Papers for every subject in play, and the HOD formulas. ────────────
  const subjectIds = [
    ...new Set(scoredClasses.flatMap((c) => c.subjectTeachers.map((st) => st.subjectId))),
  ];

  const papers = await db.paper.findMany({
    where:   { schoolId, frameworkId: framework.id, subjectId: { in: subjectIds } },
    select:  { id: true, name: true, maxMarks: true, subjectId: true },
    orderBy: { sortOrder: "asc" },
  }) as Array<FormulaPaper & { subjectId: string }>;

  const papersBySubject = new Map<string, FormulaPaper[]>();
  for (const p of papers) {
    const list = papersBySubject.get(p.subjectId) ?? [];
    list.push({ id: p.id, name: p.name, maxMarks: p.maxMarks });
    papersBySubject.set(p.subjectId, list);
  }

  const resolveFormula = (await loadFormulaResolvers(schoolId, [periodId])).get(periodId)!;

  // ── 3. Every score for this period, in one query. ─────────────────────────
  const studentIds = scoredClasses.flatMap((c) => c.students.map((s) => s.id));
  const items = await db.assessmentItem.findMany({
    where: {
      periodId,
      schoolId,
      resultKind: "NUMERIC",
      studentId:  { in: studentIds },
      paperId:    { in: papers.map((p) => p.id) },
    },
    select: { studentId: true, paperId: true, numericScore: true },
  }) as Array<{ studentId: string; paperId: string; numericScore: number | null }>;

  const scoreByStudentPaper = new Map<string, number>();
  for (const it of items) {
    if (it.numericScore !== null) {
      scoreByStudentPaper.set(`${it.studentId}:${it.paperId}`, it.numericScore);
    }
  }

  // ── 4. Resolve every (class, subject, student) mark, and gate on
  //       completeness: one missing mark anywhere means the period is not
  //       finished and nobody is notified yet. ─────────────────────────────
  type Bucket = {
    classId: string; className: string;
    subjectId: string; subjectName: string;
    teacherId: string | null;
    marks: number[];
  };
  const buckets: Bucket[] = [];
  const marksBySubject = new Map<string, number[]>();

  for (const cls of scoredClasses) {
    const className = classDisplayName(cls);

    for (const st of cls.subjectTeachers) {
      const subjectPapers = papersBySubject.get(st.subjectId) ?? [];
      // A subject with no papers configured cannot be marked at all; skipping
      // it keeps an unconfigured subject from blocking the whole period.
      if (subjectPapers.length === 0) continue;

      const formula = resolveFormula(st.subjectId, cls.form);
      const marks: number[] = [];

      for (const student of cls.students) {
        const scores = subjectPapers.map(
          (p) => scoreByStudentPaper.get(`${student.id}:${p.id}`) ?? null
        );
        const mark = computeSubjectMark(subjectPapers, scores, formula);
        if (mark === null) return NOT_COMPLETE; // still outstanding — stop here
        marks.push(mark);
      }

      buckets.push({
        classId:     cls.id,
        className,
        subjectId:   st.subjectId,
        subjectName: st.subject.name,
        teacherId:   st.teacherId,
        marks,
      });

      const all = marksBySubject.get(st.subjectId) ?? [];
      all.push(...marks);
      marksBySubject.set(st.subjectId, all);
    }
  }

  if (buckets.length === 0) return NOT_COMPLETE;

  // ── 5. School-wide mean per subject, then who sits below it. ──────────────
  const schoolMeanBySubject = new Map<string, number>();
  for (const [subjectId, marks] of marksBySubject) {
    schoolMeanBySubject.set(subjectId, marks.reduce((a, b) => a + b, 0) / marks.length);
  }

  const rows: SubjectFailureRow[] = buckets.map((b) => {
    const schoolMean = schoolMeanBySubject.get(b.subjectId)!;
    return {
      classId:     b.classId,
      className:   b.className,
      subjectId:   b.subjectId,
      subjectName: b.subjectName,
      teacherId:   b.teacherId,
      failing:     b.marks.filter((m) => m < schoolMean).length,
      total:       b.marks.length,
      classMean:   b.marks.reduce((a, x) => a + x, 0) / b.marks.length,
      schoolMean,
    };
  });

  // ── 6. Notify. ────────────────────────────────────────────────────────────
  const notifiedUsers =
    (await notifyAdmins(schoolId, period.name, dedupKey, rows)) +
    (await notifyTeachers(schoolId, period.name, dedupKey, rows));

  return { complete: true, alreadySent: false, rows, notifiedUsers };
}

/**
 * Principal + anyone holding full ASSESSMENTS management rights. Both are
 * resolved from the same rules getEffectivePermissions() uses: PRINCIPAL is
 * unconditional, everyone else needs an ASSESSMENTS role row with canManage.
 */
async function notifyAdmins(
  schoolId: string,
  periodName: string,
  dedupKey: string,
  rows: SubjectFailureRow[]
): Promise<number> {
  const hotspots = [...rows]
    .filter((r) => r.failing > 0)
    .sort((a, b) => b.failing - a.failing || a.classMean - b.classMean)
    .slice(0, TOP_HOTSPOTS);

  if (hotspots.length === 0) return 0;

  const admins = await prisma.user.findMany({
    where: {
      schoolId,
      isActive: true,
      OR: [
        { role: "PRINCIPAL" },
        // Multi-role assignments (UserStaffRole).
        {
          userStaffRoles: {
            some: {
              staffRole: {
                permissions: { some: { module: "ASSESSMENTS", canManage: true } },
              },
            },
          },
        },
        // Legacy single-role FK, for accounts that pre-date the join table.
        {
          staffRole: {
            permissions: { some: { module: "ASSESSMENTS", canManage: true } },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (admins.length === 0) return 0;

  const lines = hotspots.map(
    (h) =>
      `${h.className} — ${h.subjectName}: ${h.failing} of ${h.total} below the school average ` +
      `(class mean ${h.classMean.toFixed(1)} vs school ${h.schoolMean.toFixed(1)}).`
  );

  await notifyUsers(admins.map((a) => a.id), {
    schoolId,
    type:  "EXAM_ANALYSIS_ADMIN",
    title: `${periodName}: all marks are in`,
    body:
      `Classes with the most learners below the school subject average:\n` +
      lines.join("\n") +
      `\nConsider speaking with the teachers of these subjects.`,
    href:     "/principal/assessments",
    dedupKey,
    metadata: { periodName, hotspots },
  });

  return admins.length;
}

/**
 * One notification per teacher, covering every (class, subject) they teach in
 * which at least one learner came out below the school average. A teacher with
 * several affected classes gets a single message listing all of them, rather
 * than one notification per class.
 */
async function notifyTeachers(
  schoolId: string,
  periodName: string,
  dedupKey: string,
  rows: SubjectFailureRow[]
): Promise<number> {
  const affected = rows.filter((r) => r.failing > 0 && r.teacherId);
  if (affected.length === 0) return 0;

  const byTeacher = new Map<string, SubjectFailureRow[]>();
  for (const r of affected) {
    const list = byTeacher.get(r.teacherId!) ?? [];
    list.push(r);
    byTeacher.set(r.teacherId!, list);
  }

  const teachers = await prisma.teacher.findMany({
    where:  { id: { in: [...byTeacher.keys()] }, userId: { not: null } },
    select: { id: true, userId: true },
  });

  let sent = 0;
  for (const teacher of teachers) {
    const mine = byTeacher.get(teacher.id)!;
    const lines = mine.map(
      (r) =>
        `${r.className} — ${r.subjectName}: ${r.failing} of ${r.total} below the school average ` +
        `of ${r.schoolMean.toFixed(1)} (your class mean ${r.classMean.toFixed(1)}).`
    );

    await notifyUser({
      schoolId,
      userId: teacher.userId!,
      type:   "EXAM_ANALYSIS_TEACHER",
      title:  `${periodName}: learners below average in your subject`,
      body:   lines.join("\n"),
      href:   "/teacher/assessments",
      dedupKey,
      metadata: { periodName, rows: mine },
    });
    sent++;
  }

  return sent;
}
