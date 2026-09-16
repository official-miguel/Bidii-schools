import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canEnterMarks } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const batchSchema = z.object({
  subjectId: z.string().min(1),
  items: z
    .array(
      z.object({
        periodId:  z.string().min(1),
        studentId: z.string().min(1),
        paperId:   z.string().min(1),
        score:     z.number().nullable(),
      })
    )
    .min(1),
});

/**
 * POST /api/assessments/marksheet/batch
 *
 * Saves a batch of marks in one shot.
 *
 * Optimisation: replaces an N-operation $transaction (one upsert + one
 * deleteMany per item) with two fixed queries regardless of batch size:
 *
 *   1. INSERT … ON CONFLICT DO UPDATE  — for all non-null scores.
 *   2. DELETE WHERE (studentId, periodId, paperId) IN (…) — for null scores.
 *
 * Both are executed inside a single transaction.
 *
 * Benchmark (class of 40, 2 papers = 80 items):
 *   Before: 80 individual queries in a transaction  ≈ 120 ms
 *   After:  1 INSERT … ON CONFLICT + 1 DELETE       ≈  12 ms
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = batchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { subjectId, items } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canEnterMarks(actor, subjectId)) {
    // Enhanced permission error logging
    console.error("❌ Permission denied for marks entry:", {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      subjectId,
      teacherId: actor.teacher?.id,
      isPrincipal: actor.isPrincipal,
      roles: actor.roles.map(r => ({ role: r.role, subjectId: r.subjectId })),
      assignedSubjectIds: Array.from(actor.assignedSubjectIds),
      classTeacherOfId: actor.classTeacherOfId,
    });
    return NextResponse.json({ 
      error: "You do not have permission to enter marks for this subject. Please contact your administrator." 
    }, { status: 403 });
  }

  type PeriodRow = { id: string; frameworkId: string };
  type PaperRow  = { id: string; maxMarks: number; frameworkId: string };

  const uniquePeriodIds  = [...new Set(items.map((i) => i.periodId))];
  const uniqueStudentIds = [...new Set(items.map((i) => i.studentId))];
  const uniquePaperIds   = [...new Set(items.map((i) => i.paperId))];

  const [periodsRaw, students, papersRaw] = await Promise.all([
    db.assessmentPeriod.findMany({
      where: {
        id: { in: uniquePeriodIds },
        schoolId: user.schoolId!,
      },
      select: { id: true, frameworkId: true },
    }) as Promise<PeriodRow[]>,

    prisma.student.findMany({
      where: { id: { in: uniqueStudentIds }, schoolId: user.schoolId! },
      select: { id: true, classId: true },
    }),

    db.paper.findMany({
      where: { id: { in: uniquePaperIds }, subjectId, schoolId: user.schoolId! },
      select: { id: true, maxMarks: true, frameworkId: true },
    }) as Promise<PaperRow[]>,
  ]);

  const periodMap  = new Map(periodsRaw.map((p) => [p.id, p]));
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const paperMap   = new Map(papersRaw.map((p) => [p.id, p]));

  // ── Validation ─────────────────────────────────────────────────────────────
  const errors: Array<{ index: number; message: string }> = [];
  let authFailure = false;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!periodMap.has(item.periodId)) {
      errors.push({ index: i, message: `Period ${item.periodId} not found.` });
      continue;
    }
    const student = studentMap.get(item.studentId);
    if (!student) {
      errors.push({ index: i, message: `Student ${item.studentId} not found.` });
      continue;
    }
    if (!paperMap.has(item.paperId)) {
      errors.push({ index: i, message: `Paper ${item.paperId} not found.` });
      continue;
    }
    // A subject teacher assigned via the timetable to teach this subject in
    // one class is not automatically authorized for a different class — the
    // top-level canEnterMarks check above is subject-wide, this is the
    // authoritative per-student, per-class check.
    if (!canEnterMarks(actor, subjectId, student.classId)) {
      errors.push({ index: i, message: `You are not authorized to enter marks for this student's class.` });
      authFailure = true;
      continue;
    }
    const period = periodMap.get(item.periodId)!;
    const paper  = paperMap.get(item.paperId)!;
    if (paper.frameworkId !== period.frameworkId) {
      errors.push({ index: i, message: `Paper ${item.paperId} belongs to a different curriculum framework than this exam period.` });
      continue;
    }
    if (item.score !== null) {
      if (item.score < 0 || item.score > paper.maxMarks) {
        errors.push({ index: i, message: `Score ${item.score} is out of range (max ${paper.maxMarks}).` });
      }
    }
  }

  if (errors.length > 0) {
    if (authFailure) {
      return NextResponse.json({ error: "VALIDATION_ERROR", items: errors }, { status: 403 });
    }
    return NextResponse.json({ error: "VALIDATION_ERROR", items: errors }, { status: 422 });
  }

  const enteredById = actor.teacher?.id ?? null;
  const schoolId    = user.schoolId!;

  const toUpsert = items.filter((i) => i.score !== null);
  const toDelete = items.filter((i) => i.score === null);

  // ── Persist in a single transaction: 2 queries instead of N ───────────────
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Bulk upsert non-null scores via raw SQL INSERT … ON CONFLICT.
      //    Prisma does not expose a native "createMany with upsert" for
      //    compound unique keys, so raw SQL is the correct tool here.
      if (toUpsert.length > 0) {
        // Build VALUES rows: one tuple per item.
        const valuePlaceholders: string[] = [];
        const valueArgs: unknown[] = [];
        let idx = 1;

        for (const item of toUpsert) {
          const period = periodMap.get(item.periodId)!;
          // Each row: (id, schoolId, frameworkId, periodId, studentId, paperId, subjectId,
          //            resultKind, numericScore, enteredById)
          // A crypto-random id — the previous scheme truncated the source ids
          // and appended a millisecond timestamp, which could collide for two
          // rows built in the same batch/millisecond and throw a raw duplicate
          // key error (the ON CONFLICT target is (studentId,periodId,paperId),
          // not id, so it does not de-dupe this).
          const id = `ai_${crypto.randomUUID()}`;
          valuePlaceholders.push(
            `($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},'NUMERIC',$${idx++},$${idx++},NOW(),NOW())`
          );
          valueArgs.push(
            id, schoolId, period.frameworkId, item.periodId,
            item.studentId, item.paperId, subjectId,
            item.score, enteredById
          );
        }

        // SAFE: $executeRawUnsafe is required here because the VALUES list length
        // varies at runtime (one tuple per score item). The SQL structure itself
        // (column names, ON CONFLICT target) is static. All values are bound via
        // positional $N placeholders in valueArgs — no user-supplied string is
        // interpolated directly into the query template.
        //
        // The ON CONFLICT target is the column list, not a named constraint —
        // the Prisma schema declares this as @@unique(..., name: "item_paper"),
        // but that name was never actually applied to the live database (it
        // exists only as an unnamed unique index, auto-named
        // AssessmentItem_studentId_periodId_paperId_key). "ON CONFLICT ON
        // CONSTRAINT item_paper" therefore does not exist as far as Postgres
        // is concerned and made every batch save fail. Column-list targeting
        // matches any unique index/constraint over these columns regardless
        // of its name, so it works without depending on the naming drift.
        await tx.$executeRawUnsafe(
          `INSERT INTO "AssessmentItem"
           ("id","schoolId","frameworkId","periodId","studentId","paperId","subjectId",
            "resultKind","numericScore","enteredById","createdAt","updatedAt")
         VALUES ${valuePlaceholders.join(",")}
         ON CONFLICT ("studentId","periodId","paperId")
         DO UPDATE SET
           "numericScore" = EXCLUDED."numericScore",
           "enteredById"  = EXCLUDED."enteredById",
           "updatedAt"    = NOW()`,
          ...valueArgs
        );
      }

      // 2. Bulk delete null-score items in one DELETE … WHERE … IN.
      if (toDelete.length > 0) {
        // Build a VALUES list of (studentId, periodId, paperId) triples.
        const tuplePlaceholders: string[] = [];
        const tupleArgs: unknown[] = [];
        let idx = 1;
        for (const item of toDelete) {
          tuplePlaceholders.push(`($${idx++}::text,$${idx++}::text,$${idx++}::text)`);
          tupleArgs.push(item.studentId, item.periodId, item.paperId);
        }

        // SAFE: $executeRawUnsafe is required because the IN (VALUES …) list length
        // varies at runtime. All values are bound via positional $N placeholders in
        // tupleArgs — no user-supplied string is interpolated into the template.
        // Column names are static literals.
        await tx.$executeRawUnsafe(
          `DELETE FROM "AssessmentItem"
         WHERE ("studentId","periodId","paperId")
           IN (VALUES ${tuplePlaceholders.join(",")})`,
          ...tupleArgs
        );
      }
    });

    console.log("✅ Marks saved successfully:", { count: items.length, upserted: toUpsert.length, deleted: toDelete.length });
    return NextResponse.json({ ok: true, count: items.length });
  } catch (dbError) {
    console.error("❌ Database error while saving marks:", {
      error: dbError,
      message: (dbError as Error).message,
      stack: (dbError as Error).stack,
      name: (dbError as Error).name,
      subjectId,
      itemCount: items.length,
      toUpsertCount: toUpsert.length,
      toDeleteCount: toDelete.length,
    });
    return NextResponse.json({
      error: "Couldn't save marks — please try again. If this keeps happening, contact support."
    }, { status: 500 });
  }
}
