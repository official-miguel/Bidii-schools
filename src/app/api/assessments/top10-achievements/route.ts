import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { subjectScore, scoreToGrade, denseRank } from "@/lib/assessment/grading844";
import { resolveActiveFramework } from "@/lib/assessment/resolveFramework";
import { subjectAppliesToForm } from "@/lib/assessment/subjectScope";
import { loadCbeMarks } from "@/lib/assessment/cbeMarks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const schema = z.object({ periodId: z.string().cuid() });

/**
 * POST /api/assessments/top10-achievements
 *
 * For a given assessment period, computes rankings at two scopes:
 *   1. Class scope  — top 10 within each class (stream), e.g. Form 2A
 *   2. Form scope   — top 10 across the entire form (all streams), e.g. Form 2
 *
 * For every student whose position ≤ 10 in either scope, an ACADEMICS
 * achievement is upserted. Records are idempotent: running this twice for the
 * same period only adds students who weren't previously recognised.
 *
 * Both curricula are ranked. 8-4-4 classes are ranked on total KCSE grade
 * points; CBE classes are ranked on total raw marks, since CBE has no points
 * scale. A ranking group is always a single class or a single form, so the two
 * scales are never compared against each other.
 *
 * The endpoint requires the caller to be a PRINCIPAL.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "periodId is required." }, { status: 400 });
  }
  const { periodId } = parsed.data;

  // Periods are shared across every framework now — verify it belongs to this
  // school, then resolve the 8-4-4 framework; CBE marks come from their own
  // loader below, so a school running only CBE is still handled.
  const [period, kcseFramework] = await Promise.all([
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId: user.schoolId! },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as Promise<{ id: string; name: string; academicYear: string; term: number | null } | null>,
    resolveActiveFramework(user.schoolId!, "EIGHT_FOUR_FOUR"),
  ]);

  if (!period) {
    return NextResponse.json({ error: "Period not found." }, { status: 404 });
  }
  // ── Load every class for this school, both curricula ──────────────────────
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: [{ form: "asc" }, { name: "asc" }],
    select: { id: true, name: true, form: true, frameworkType: true },
  });

  if (classes.length === 0) {
    return NextResponse.json({ created: 0, updated: 0, classes: [] });
  }

  // ── Load all students and their scores in one pass ───────────────────────
  const allStudents = await prisma.student.findMany({
    where: { schoolId: user.schoolId!, archivedAt: null },
    select: { id: true, fullName: true, classId: true },
  });

  const studentIdSet = new Set(allStudents.map((s) => s.id));

  // PERF: replaced per-form loop (N queries for N distinct form numbers) with a
  // single findMany that returns all subjects for this school. Filter by form in JS.
  const allSubjectsForSchool = await prisma.subject.findMany({
    where: { schoolId: user.schoolId! },
    select: { id: true, applicableForms: true },
  });

  const formSet = new Set(classes.map((c) => c.form));
  const subjectsByForm = new Map<number, Array<{ id: string }>>();
  for (const form of formSet) {
    subjectsByForm.set(
      form,
      allSubjectsForSchool.filter((s) => subjectAppliesToForm(s, form))
    );
  }

  // All papers for this period's framework
  const allSubjectIds = [...new Set(
    [...subjectsByForm.values()].flatMap((subs) => subs.map((s) => s.id))
  )];
  const allPapers = kcseFramework
    ? await db.paper.findMany({
        where: { schoolId: user.schoolId!, frameworkId: kcseFramework.id, subjectId: { in: allSubjectIds } },
        select: { id: true, maxMarks: true, subjectId: true },
      }) as Array<{ id: string; maxMarks: number; subjectId: string }>
    : [];

  // CBE marks come from the shared loader so they match the mark sheet —
  // papers totalled, or the department formula applied when one is set.
  const cbeMarks = await loadCbeMarks(
    user.schoolId!,
    [periodId],
    classes.filter((c) => c.frameworkType === "CBE")
  );

  const papersBySubject = new Map<string, Array<{ id: string; maxMarks: number }>>();
  for (const p of allPapers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push(p);
    papersBySubject.set(p.subjectId, arr);
  }

  // All assessment items for this period
  const allItems = await db.assessmentItem.findMany({
    where: {
      periodId,
      schoolId: user.schoolId!,
      resultKind: "NUMERIC",
      studentId: { in: [...studentIdSet] },
    },
    select: { studentId: true, paperId: true, numericScore: true },
  }) as Array<{ studentId: string; paperId: string | null; numericScore: number | null }>;

  // Build score index: studentId → paperId → numericScore
  const scoreIndex = new Map<string, Map<string, number | null>>();
  for (const item of allItems) {
    if (!item.paperId) continue;
    if (!scoreIndex.has(item.studentId)) scoreIndex.set(item.studentId, new Map());
    scoreIndex.get(item.studentId)!.set(item.paperId, item.numericScore);
  }

  /**
   * A learner's ranking score: total KCSE grade points for 8-4-4, total raw
   * marks for CBE. Only ever compared within one class or one form, so the two
   * scales never meet.
   */
  function totalScore(studentId: string, form: number, frameworkType: string): number | null {
    const subjects = subjectsByForm.get(form) ?? [];

    if (frameworkType === "CBE") {
      let cbeTotal = 0;
      let cbeHasAny = false;
      for (const s of subjects) {
        const mark = cbeMarks.markFor(periodId, studentId, s.id);
        if (mark !== null) { cbeTotal += mark; cbeHasAny = true; }
      }
      return cbeHasAny ? cbeTotal : null;
    }

    const studentScores = scoreIndex.get(studentId);
    let total = 0;
    let hasAny = false;
    for (const s of subjects) {
      const papers = papersBySubject.get(s.id) ?? [];
      if (papers.length === 0) continue;
      const scores = papers.map((p) => studentScores?.get(p.id) ?? null);
      const pct = subjectScore(scores, papers.map((p) => p.maxMarks));
      if (pct !== null) { total += scoreToGrade(pct).points; hasAny = true; }
    }
    return hasAny ? total : null;
  }

  // ── Compute top-10 sets ───────────────────────────────────────────────────

  // Set of studentIds who qualify: position ≤ 10 in their class OR their form
  const top10ByClass = new Map<string, { classId: string; className: string; position: number }>();
  const top10ByForm  = new Map<string, { form: number; position: number }>();

  // Class-level ranking
  for (const cls of classes) {
    const classStudents = allStudents.filter((s) => s.classId === cls.id);
    if (classStudents.length === 0) continue;

    const pts = classStudents.map((s) => totalScore(s.id, cls.form, cls.frameworkType));
    const ranks = denseRank(pts);

    classStudents.forEach((s, i) => {
      const rank = ranks[i];
      if (rank !== null && rank <= 10) {
        top10ByClass.set(s.id, { classId: cls.id, className: cls.name, position: rank });
      }
    });
  }

  // Form-level ranking: group classes by form number AND curriculum, so a form
  // running both never ranks grade points against raw marks.
  const classesByForm = new Map<string, typeof classes>();
  for (const cls of classes) {
    const key = `${cls.form}:${cls.frameworkType}`;
    const arr = classesByForm.get(key) ?? [];
    arr.push(cls);
    classesByForm.set(key, arr);
  }

  for (const formClasses of classesByForm.values()) {
    const form = formClasses[0].form;
    const formStudents = allStudents.filter((s) =>
      formClasses.some((c) => c.id === s.classId)
    );
    if (formStudents.length === 0) continue;

    const pts = formStudents.map((s) => totalScore(s.id, form, formClasses[0].frameworkType));
    const ranks = denseRank(pts);

    formStudents.forEach((s, i) => {
      const rank = ranks[i];
      if (rank !== null && rank <= 10) {
        top10ByForm.set(s.id, { form, position: rank });
      }
    });
  }

  // Union of all qualifying student IDs
  const qualifyingIds = new Set([...top10ByClass.keys(), ...top10ByForm.keys()]);

  if (qualifyingIds.size === 0) {
    return NextResponse.json({
      created: 0,
      updated: 0,
      totalStudents: 0,
      message: "No students with results found for this period.",
    });
  }

  // ── Upsert achievements ───────────────────────────────────────────────────
  // Strategy: one Achievement row per class per period (title includes class name).
  // We also create one form-wide row for students who qualified at form level
  // but aren't in the class-level top 10 (they may be in a different stream).
  //
  // For simplicity and idempotency we:
  //   1. Look for an existing achievement for this period+class combination.
  //   2. If it exists, add any missing students via upsert on AchievementStudent.
  //   3. If not, create a fresh one.

  const periodLabel = period.term ? `Term ${period.term} ${period.academicYear}` : period.name;

  let created = 0;
  let updated = 0;
  const processedStudentIds: string[] = [];

  // ── Class-level achievements ──────────────────────────────────────────────
  for (const cls of classes) {
    const classTopStudentIds = [...top10ByClass.entries()]
      .filter(([, v]) => v.classId === cls.id)
      .map(([id]) => id);

    if (classTopStudentIds.length === 0) continue;

    const title = `Top 10 — ${cls.name} · ${periodLabel}`;
    const description = `Recognised for ranking in the top 10 of ${cls.name} during ${periodLabel}.`;

    // Check if an achievement for this class+period already exists
    const existing = await prisma.achievement.findFirst({
      where: {
        schoolId: user.schoolId!,
        title,
        category: "ACADEMICS",
      },
      include: { students: { select: { studentId: true } } },
    });

    if (existing) {
      // Add only newly qualifying students
      const alreadyLinked = new Set(existing.students.map((s) => s.studentId));
      const newStudents = classTopStudentIds.filter((id) => !alreadyLinked.has(id));
      if (newStudents.length > 0) {
        await prisma.achievementStudent.createMany({
          data: newStudents.map((studentId) => ({ achievementId: existing.id, studentId })),
          skipDuplicates: true,
        });
        updated++;
      }
    } else {
      await prisma.achievement.create({
        data: {
          schoolId: user.schoolId!,
          title,
          category: "ACADEMICS",
          description,
          achievementDate: new Date(),
          awardLevel: "Class Top 10",
          aiSummary: `Top 10 academic performers in ${cls.name} for ${periodLabel}.`,
          students: {
            create: classTopStudentIds.map((studentId) => ({ studentId })),
          },
        },
      });
      created++;
    }

    processedStudentIds.push(...classTopStudentIds);
  }

  // ── Form-level achievements — for students top-10 in their form ───────────
  for (const formClasses of classesByForm.values()) {
    const form = formClasses[0].form;
    const formTopStudentIds = [...top10ByForm.keys()].filter((id) => {
      return formClasses.some((c) => allStudents.find((s) => s.id === id)?.classId === c.id);
    });

    if (formTopStudentIds.length === 0) continue;

    const title = `Top 10 — Form ${form} · ${periodLabel}`;
    const description = `Recognised for ranking in the top 10 of Form ${form} during ${periodLabel}.`;

    const existing = await prisma.achievement.findFirst({
      where: {
        schoolId: user.schoolId!,
        title,
        category: "ACADEMICS",
      },
      include: { students: { select: { studentId: true } } },
    });

    if (existing) {
      const alreadyLinked = new Set(existing.students.map((s) => s.studentId));
      const newStudents = formTopStudentIds.filter((id) => !alreadyLinked.has(id));
      if (newStudents.length > 0) {
        await prisma.achievementStudent.createMany({
          data: newStudents.map((studentId) => ({ achievementId: existing.id, studentId })),
          skipDuplicates: true,
        });
        updated++;
      }
    } else {
      await prisma.achievement.create({
        data: {
          schoolId: user.schoolId!,
          title,
          category: "ACADEMICS",
          description,
          achievementDate: new Date(),
          awardLevel: "Form Top 10",
          aiSummary: `Top 10 academic performers across Form ${form} for ${periodLabel}.`,
          students: {
            create: formTopStudentIds.map((studentId) => ({ studentId })),
          },
        },
      });
      created++;
    }

    processedStudentIds.push(...formTopStudentIds);
  }

  const uniqueStudents = new Set(processedStudentIds).size;

  return NextResponse.json({
    created,
    updated,
    totalStudents: uniqueStudents,
    message: `${created} achievement record${created !== 1 ? "s" : ""} created, ${updated} updated — ${uniqueStudents} student${uniqueStudents !== 1 ? "s" : ""} recognised.`,
  });
}
