/**
 * src/lib/finance/debtor.ts
 *
 * Debtor flagging logic for the Fees & Ledger module.
 *
 * recomputeDebtorFlag — called inside postLedgerEntry after every ledger write.
 *   Creates a DebtorFlag when balance crosses the threshold, clears it when recovered.
 *
 * runDailyDebtorJob — called by the /api/finance/jobs/debtor-refresh cron endpoint.
 *   Iterates all schools, finds students with isCurrent=true DebtorFlag rows, and
 *   recalculates daysOverdueAtFlag based on the oldest unpaid INVOICE entry date.
 *
 * Debtor threshold logic:
 *   A student is a debtor when currentBalance < -balanceThreshold.
 *   e.g. threshold=500 → flagged when balance < -500 (owes more than 500).
 *   threshold=0 → any negative balance is a debt.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

// The Prisma transaction client type — mirrors the type in ledger.ts
type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Recomputes the debtor flag for a single student within a transaction.
 * Must be called inside a prisma.$transaction that has already set the
 * RLS session variable.
 *
 * Logic:
 * - If balance < -threshold AND no current flag exists → create flag
 * - If balance >= -threshold AND a current flag exists → clear flag
 * - Otherwise → no-op
 */
export async function recomputeDebtorFlag(
  tx: PrismaTransactionClient,
  schoolId: string,
  studentId: string
): Promise<void> {
  // Load the finance account and school settings in parallel
  const [account, settings] = await Promise.all([
    tx.studentFinanceAccount.findUnique({
      where: { schoolId_studentId: { schoolId, studentId } },
      select: { currentBalance: true },
    }),
    tx.financeSettings.findUnique({
      where: { schoolId },
      select: { balanceThreshold: true },
    }),
  ]);

  // If no account or no settings row yet, nothing to flag
  if (!account || !settings) return;

  const balance   = new Decimal(account.currentBalance.toString());
  // Threshold is stored as a positive number. e.g. 500 → flag when balance < -500
  const threshold = new Decimal(settings.balanceThreshold.toString()).negated();
  const isInDebt  = balance.lessThan(threshold);

  // Check for an existing current flag
  const currentFlag = await tx.debtorFlag.findFirst({
    where: { schoolId, studentId, isCurrent: true },
    select: { id: true },
  });

  if (isInDebt && !currentFlag) {
    // Student has just crossed into debt — create a new flag
    await tx.debtorFlag.create({
      data: {
        schoolId,
        studentId,
        flaggedAt:         new Date(),
        balanceAtFlag:     balance,
        daysOverdueAtFlag: 0,  // will be updated by the daily cron job
        isCurrent:         true,
      },
    });
  } else if (!isInDebt && currentFlag) {
    // Student's balance has recovered — clear the flag
    await tx.debtorFlag.update({
      where: { id: currentFlag.id },
      data: {
        isCurrent:   false,
        unflaggedAt: new Date(),
      },
    });
  }
  // Otherwise: no change needed
}

/**
 * Daily cron job — iterates all schools and all students with isCurrent=true
 * debtor flags, then recalculates daysOverdueAtFlag from the oldest unpaid
 * INVOICE entry date. This handles the "days overdue advances with the calendar"
 * requirement — even with no new transactions, days overdue must increase daily.
 *
 * Also re-checks the balance threshold to clear any flags that should have been
 * cleared but weren't (e.g. if the threshold was changed after the last ledger event).
 *
 * Returns the total number of flag rows updated.
 */
export async function runDailyDebtorJob(): Promise<number> {
  // Load all schools that have at least one current debtor flag
  const schoolsWithFlags = await prisma.debtorFlag.findMany({
    where: { isCurrent: true },
    select: { schoolId: true },
    distinct: ["schoolId"],
  });

  let updatedCount = 0;

  for (const { schoolId } of schoolsWithFlags) {
    // Load all current flags for this school
    const flags = await prisma.debtorFlag.findMany({
      where: { schoolId, isCurrent: true },
      select: { id: true, studentId: true },
    });

    // Load finance settings for this school
    const settings = await prisma.financeSettings.findUnique({
      where: { schoolId },
      select: { balanceThreshold: true },
    });

    for (const flag of flags) {
      try {
        await prisma.$transaction(async (tx) => {
          // Re-check the student's current balance
          const account = await tx.studentFinanceAccount.findUnique({
            where: { schoolId_studentId: { schoolId, studentId: flag.studentId } },
            select: { currentBalance: true },
          });

          if (!account) return;

          const balance   = new Decimal(account.currentBalance.toString());
          const threshold = settings
            ? new Decimal(settings.balanceThreshold.toString()).negated()
            : new Decimal(0);

          if (!balance.lessThan(threshold)) {
            // Balance has recovered — clear the flag
            await tx.debtorFlag.update({
              where: { id: flag.id },
              data: { isCurrent: false, unflaggedAt: new Date() },
            });
            updatedCount++;
            return;
          }

          // Still in debt — recalculate daysOverdueAtFlag from oldest unpaid INVOICE
          const oldestInvoice = await tx.ledgerEntry.findFirst({
            where: {
              schoolId,
              studentId: flag.studentId,
              entryType: "INVOICE",
              isVoided:  false,
            },
            orderBy: { postedAt: "asc" },
            select:  { postedAt: true },
          });

          if (oldestInvoice) {
            const now      = new Date();
            const msPerDay = 1000 * 60 * 60 * 24;
            const daysOverdue = Math.floor(
              (now.getTime() - oldestInvoice.postedAt.getTime()) / msPerDay
            );

            await tx.debtorFlag.update({
              where: { id: flag.id },
              data: { daysOverdueAtFlag: Math.max(0, daysOverdue) },
            });
            updatedCount++;
          }
        });
      } catch {
        // Non-fatal — continue processing other students
      }
    }
  }

  return updatedCount;
}
