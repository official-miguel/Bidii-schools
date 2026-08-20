/**
 * src/lib/finance/balance.ts
 *
 * Fallback balance recomputation from the raw ledger.
 * Used for consistency checks and data recovery if the materialised cache
 * in StudentFinanceAccount ever diverges from the ledger.
 *
 * Normal reads should use StudentFinanceAccount.currentBalance (fast).
 * This function is O(n ledger entries) — only call when needed.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { LedgerEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { balanceDelta } from "./ledger";

/**
 * Recomputes a student's balance from the full ledger history.
 * Excludes voided entries (isVoided = true).
 */
export async function computeBalance(
  schoolId: string,
  studentId: string
): Promise<Decimal> {
  const entries = await prisma.ledgerEntry.findMany({
    where:   { schoolId, studentId, isVoided: false },
    select:  { entryType: true, amount: true },
    orderBy: { postedAt: "asc" },
  });

  return entries.reduce<Decimal>(
    (acc, entry) =>
      acc.plus(
        balanceDelta(
          entry.entryType as LedgerEntryType,
          new Decimal(entry.amount.toString())
        )
      ),
    new Decimal(0)
  );
}

/**
 * Resyncs the materialised StudentFinanceAccount balance from the ledger.
 * Call this when you suspect the cache is stale.
 */
export async function reconcileBalance(
  schoolId: string,
  studentId: string
): Promise<Decimal> {
  const [balance, invoicedSum, paidSum] = await Promise.all([
    computeBalance(schoolId, studentId),
    prisma.ledgerEntry.aggregate({
      where: { schoolId, studentId, entryType: "INVOICE", isVoided: false },
      _sum:  { amount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { schoolId, studentId, entryType: "PAYMENT", isVoided: false },
      _sum:  { amount: true },
    }),
  ]);

  await prisma.studentFinanceAccount.update({
    where: { schoolId_studentId: { schoolId, studentId } },
    data: {
      currentBalance: balance,
      totalInvoiced:  new Decimal((invoicedSum._sum.amount ?? 0).toString()),
      totalPaid:      new Decimal((paidSum._sum.amount ?? 0).toString()),
      lastActivityAt: new Date(),
    },
  });

  return balance;
}
