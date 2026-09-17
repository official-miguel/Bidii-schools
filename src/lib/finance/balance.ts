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

export interface BalanceReconcileReport {
  /** Finance accounts examined. */
  scanned:  number;
  /** Accounts whose cached figures disagreed with the ledger. */
  drifted:  number;
  /** A sample of the drift, for the cron log — capped so the response stays small. */
  examples: Array<{
    schoolId:  string;
    studentId: string;
    cached:    string;
    actual:    string;
  }>;
}

/** Cap on `examples` so a wide drift event can't return a huge payload. */
const DRIFT_EXAMPLE_LIMIT = 20;

/**
 * Sweeps every finance account and repairs any that disagrees with the ledger.
 *
 * This is the safety net for the materialised cache in StudentFinanceAccount.
 * Individual writes keep it correct via postLedgerEntry / voidLedgerEntry, but
 * a crashed transaction or an out-of-band SQL fix can leave it stale, and
 * nothing else would ever notice.
 *
 * Deliberately set-based rather than a per-student loop over reconcileBalance:
 * one groupBy over the ledger plus one pass over the accounts, writing only the
 * rows that actually drifted. Drift should be rare, so steady state is two
 * reads and no writes.
 */
export async function runBalanceReconcileJob(): Promise<BalanceReconcileReport> {
  // 1. Ledger truth, aggregated in the database.
  const sums = await prisma.ledgerEntry.groupBy({
    by:    ["schoolId", "studentId", "entryType"],
    where: { isVoided: false },
    _sum:  { amount: true },
  });

  interface Totals { balance: Decimal; invoiced: Decimal; paid: Decimal }
  const truth = new Map<string, Totals>();

  for (const row of sums) {
    const key = `${row.schoolId}:${row.studentId}`;
    const acc = truth.get(key) ?? {
      balance:  new Decimal(0),
      invoiced: new Decimal(0),
      paid:     new Decimal(0),
    };

    const amount = new Decimal((row._sum.amount ?? 0).toString());
    acc.balance = acc.balance.plus(
      balanceDelta(row.entryType as LedgerEntryType, amount)
    );
    if (row.entryType === "INVOICE") acc.invoiced = acc.invoiced.plus(amount);
    if (row.entryType === "PAYMENT")  acc.paid     = acc.paid.plus(amount);

    truth.set(key, acc);
  }

  // 2. Compare against the cache.
  const accounts = await prisma.studentFinanceAccount.findMany({
    select: {
      schoolId: true, studentId: true,
      currentBalance: true, totalInvoiced: true, totalPaid: true,
    },
  });

  const zero: Totals = {
    balance:  new Decimal(0),
    invoiced: new Decimal(0),
    paid:     new Decimal(0),
  };

  const report: BalanceReconcileReport = {
    scanned:  accounts.length,
    drifted:  0,
    examples: [],
  };

  for (const account of accounts) {
    // No ledger rows at all is legitimate — the correct totals are then zero.
    const actual = truth.get(`${account.schoolId}:${account.studentId}`) ?? zero;

    const cachedBalance  = new Decimal(account.currentBalance.toString());
    const cachedInvoiced = new Decimal(account.totalInvoiced.toString());
    const cachedPaid     = new Decimal(account.totalPaid.toString());

    if (
      cachedBalance.equals(actual.balance) &&
      cachedInvoiced.equals(actual.invoiced) &&
      cachedPaid.equals(actual.paid)
    ) {
      continue;
    }

    report.drifted += 1;
    if (report.examples.length < DRIFT_EXAMPLE_LIMIT) {
      report.examples.push({
        schoolId:  account.schoolId,
        studentId: account.studentId,
        cached:    cachedBalance.toString(),
        actual:    actual.balance.toString(),
      });
    }

    // Repair. lastActivityAt is intentionally left alone: this is a correction,
    // not student activity, and bumping it would distort dormancy reporting.
    await prisma.studentFinanceAccount.update({
      where: { schoolId_studentId: { schoolId: account.schoolId, studentId: account.studentId } },
      data: {
        currentBalance: actual.balance,
        totalInvoiced:  actual.invoiced,
        totalPaid:      actual.paid,
      },
    });
  }

  return report;
}
