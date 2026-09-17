import { NextRequest, NextResponse } from "next/server";
import { prisma }                      from "@/lib/prisma";
import { Prisma }                      from "@prisma/client";
import { requireSuperAdmin, logAudit } from "@/lib/super-admin";
import { postLedgerEntry }             from "@/lib/finance/ledger";

// Undoing a large import touches every model the processor wrote to, so give
// it the same headroom the processor itself gets.
export const maxDuration = 300;

/**
 * Mirror of the ChangeLogEntry type written by imports/process/route.ts.
 * Redeclared here because a route.ts file may only export route handlers.
 *
 *   previous: {...}  → the row existed before the import and these fields were
 *                      overwritten; restore them.
 *   previous: null   → the row was created by the import but its model has no
 *                      importJobId column (User accounts); delete it.
 */
type ChangeLogEntry = {
  model:    string;
  id:       string;
  previous: Record<string, unknown> | null;
};

function parseChangeLog(raw: Prisma.JsonValue | null): ChangeLogEntry[] {
  if (!Array.isArray(raw)) return [];

  const out: ChangeLogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const e = item as Record<string, Prisma.JsonValue>;
    if (typeof e.model !== "string" || typeof e.id !== "string") continue;

    const previous =
      e.previous && typeof e.previous === "object" && !Array.isArray(e.previous)
        ? (e.previous as Record<string, unknown>)
        : null;

    out.push({ model: e.model, id: e.id, previous });
  }
  return out;
}

/**
 * The first snapshot recorded for a row is its true pre-import state — later
 * passes over the same row already contain import-written values. Keep the
 * earliest entry per (model, id) and drop the rest.
 */
function firstPerRow(entries: ChangeLogEntry[]): ChangeLogEntry[] {
  const seen = new Set<string>();
  return entries.filter(e => {
    const key = `${e.model}::${e.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** POST /api/super-admin/imports/[id]/rollback */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await prisma.importJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.status !== "COMPLETED") {
    return NextResponse.json({ error: "Only completed imports can be rolled back" }, { status: 422 });
  }

  if (job.rollbackAt && new Date() > job.rollbackAt) {
    return NextResponse.json({ error: "Rollback window has expired" }, { status: 422 });
  }

  const jobId      = job.id;
  const { schoolId } = job;
  const changeLog  = firstPerRow(parseChangeLog(job.changeLog));
  const tag        = { importJobId: jobId };

  // Dorm capacities are derived from sleeping positions, so note which dorms
  // are affected before the positions disappear and recompute afterwards.
  const affectedDormIds = [
    ...new Set(
      (await prisma.sleepingPosition.findMany({
        where: tag, select: { dormId: true },
      })).map(p => p.dormId)
    ),
  ];

  // Teacher login accounts have no importJobId of their own — they are found
  // through the teacher rows that are about to be deleted, plus the explicit
  // creation markers the processor left in the change log.
  const teachersToDelete = await prisma.teacher.findMany({
    where: tag, select: { userId: true },
  });
  const userIdsToDelete = [
    ...new Set([
      ...teachersToDelete.map(t => t.userId).filter((id): id is string => !!id),
      ...changeLog.filter(e => e.model === "User" && e.previous === null).map(e => e.id),
    ]),
  ];

  // Opening balances are never deleted — financial history stays immutable.
  // Each one gets a compensating CREDIT_ADJUSTMENT instead, which cancels the
  // OPENING_BALANCE debit under both the materialised balance and a full
  // recompute (neither entry is voided, so they simply sum to zero).
  const openingEntries = await prisma.ledgerEntry.findMany({
    where: {
      schoolId,
      entryType:     "OPENING_BALANCE",
      referenceType: "IMPORT_JOB",
      referenceId:   jobId,
      isVoided:      false,
    },
    select: { id: true, studentId: true, amount: true, termId: true },
  });

  let reverted: Record<string, number>;

  try {
    reverted = await prisma.$transaction(async tx => {
      // ── 1. Delete created rows, children before parents ──────────────────
      const allocations      = await tx.allocationRecord.deleteMany({ where: tag });
      const studentElectives = await tx.studentElective.deleteMany({ where: tag });
      const teacherSubjects  = await tx.teacherSubject.deleteMany({ where: tag });
      const positions        = await tx.sleepingPosition.deleteMany({ where: tag });
      const beds             = await tx.bed.deleteMany({ where: tag });
      const cubicles         = await tx.cubicle.deleteMany({ where: tag });
      const dormitories      = await tx.dormitory.deleteMany({ where: tag });
      const students         = await tx.student.deleteMany({ where: tag });
      const teachers         = await tx.teacher.deleteMany({ where: tag });
      const users            = userIdsToDelete.length > 0
        ? await tx.user.deleteMany({ where: { id: { in: userIdsToDelete }, schoolId } })
        : { count: 0 };
      const subjects         = await tx.subject.deleteMany({ where: tag });
      const classes          = await tx.schoolClass.deleteMany({ where: tag });
      const departments      = await tx.department.deleteMany({ where: tag });

      // ── 2. Restore rows the import overwrote ─────────────────────────────
      let restored = 0;
      for (const entry of changeLog) {
        if (!entry.previous) continue; // creation marker, already handled above
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = entry.previous as any;
        try {
          switch (entry.model) {
            case "SchoolClass":       await tx.schoolClass.update({      where: { id: entry.id }, data }); break;
            case "Subject":           await tx.subject.update({          where: { id: entry.id }, data }); break;
            case "Teacher":           await tx.teacher.update({          where: { id: entry.id }, data }); break;
            case "Student":           await tx.student.update({          where: { id: entry.id }, data }); break;
            case "Dormitory":         await tx.dormitory.update({        where: { id: entry.id }, data }); break;
            case "Bed":               await tx.bed.update({              where: { id: entry.id }, data }); break;
            case "SleepingPosition":  await tx.sleepingPosition.update({ where: { id: entry.id }, data }); break;
            case "AllocationRecord":  await tx.allocationRecord.update({ where: { id: entry.id }, data }); break;
            default: continue;
          }
          restored++;
        } catch {
          // The row was deleted above (or by the school since the import) —
          // there is nothing left to restore, which is the desired end state.
        }
      }

      // ── 3. Reverse opening-balance ledger entries ────────────────────────
      let reversals = 0;
      for (const e of openingEntries) {
        await postLedgerEntry(tx, {
          schoolId,
          studentId:     e.studentId,
          termId:        e.termId ?? undefined,
          entryType:     "CREDIT_ADJUSTMENT",
          amount:        e.amount,
          description:   `Reversal of opening balance imported by job ${jobId}`,
          referenceId:   jobId,
          referenceType: "IMPORT_JOB_ROLLBACK",
          postedById:    user.id,
        });
        reversals++;
      }

      // ── 4. Recompute dorm capacity from the surviving positions ──────────
      for (const dormId of affectedDormIds) {
        const posCount = await tx.sleepingPosition.count({ where: { dormId, schoolId } });
        await tx.dormitory.updateMany({ where: { id: dormId }, data: { totalCapacity: posCount } });
      }

      return {
        departments:      departments.count,
        classes:          classes.count,
        subjects:         subjects.count,
        teachers:         teachers.count,
        teacherSubjects:  teacherSubjects.count,
        userAccounts:     users.count,
        students:         students.count,
        studentElectives: studentElectives.count,
        dormitories:      dormitories.count,
        cubicles:         cubicles.count,
        beds:             beds.count,
        sleepingPositions: positions.count,
        allocations:      allocations.count,
        rowsRestored:     restored,
        ledgerReversals:  reversals,
      };
    }, { timeout: 120_000, maxWait: 15_000 });
  } catch (e) {
    return NextResponse.json(
      { error: "Rollback failed — nothing was changed", detail: String(e) },
      { status: 500 },
    );
  }

  const updated = await prisma.importJob.update({
    where: { id: jobId },
    data:  { status: "ROLLED_BACK", rolledBackAt: new Date() },
  });

  await logAudit(user.id, "IMPORT_ROLLED_BACK", "school", schoolId, {
    jobId, type: job.type, fileName: job.fileName, reverted,
  });

  return NextResponse.json({ job: updated, reverted });
}
