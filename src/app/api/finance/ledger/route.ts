/**
 * GET /api/finance/ledger — Paginated school-wide ledger
 *
 * Returns:
 *  - entries[]        — paginated LedgerEntry rows (newest first)
 *  - schoolStats      — stable school-wide invoiced / paid / outstanding aggregates
 *  - termBatchStats   — per-term live outstanding for batch invoice rows
 *                       keyed by termId; computed from StudentFinanceAccount so
 *                       it reflects real-time payments and carry-forward without
 *                       reading individual entry amounts.
 *
 * termBatchStats shape:
 *   {
 *     [termId]: {
 *       outstanding: string   // SUM(abs(currentBalance)) for debtors in this term
 *       invoiced:    string   // SUM(totalAmount) from Invoice table for this term
 *       count:       number   // number of students with an invoice for this term
 *       postedAt:    string   // ISO timestamp of the earliest invoice in the batch
 *     }
 *   }
 *
 * This replaces the previous approach of summing per-entry
 * student.financeAccount.currentBalance on the client, which was wrong
 * because:
 *   1. currentBalance is school-wide (all terms), not scoped to a single term.
 *   2. Batch grouping on the client breaks across page boundaries.
 */
import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import type { LedgerEntryType, Prisma } from "@prisma/client";

const VALID_ENTRY_TYPES = new Set<string>([
  "INVOICE", "PAYMENT", "CREDIT_ADJUSTMENT", "DEBIT_ADJUSTMENT", "OPENING_BALANCE",
]);

export async function GET(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const { searchParams } = new URL(req.url);
  const studentId    = searchParams.get("studentId");
  const termId       = searchParams.get("termId");
  const entryTypeRaw = searchParams.get("entryType");
  const entryType    = entryTypeRaw && VALID_ENTRY_TYPES.has(entryTypeRaw)
    ? (entryTypeRaw as LedgerEntryType)
    : null;
  const fromDate      = searchParams.get("fromDate");
  const toDate        = searchParams.get("toDate");
  const isVoidedParam = searchParams.get("isVoided");
  const isVoided =
    isVoidedParam === "true"  ? true  :
    isVoidedParam === "false" ? false : undefined;
  const search   = searchParams.get("q")?.trim() ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page")     ?? "1",  10));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

  const where: Record<string, unknown> = {
    schoolId,
    ...(studentId              ? { studentId }  : {}),
    ...(termId                 ? { termId }     : {}),
    ...(entryType              ? { entryType }  : {}),
    ...(isVoided !== undefined ? { isVoided }   : {}),
    ...(fromDate || toDate ? {
      postedAt: {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        ...(toDate   ? { lte: new Date(toDate) }   : {}),
      },
    } : {}),
    ...(search ? {
      student: {
        OR: [
          { fullName:        { contains: search, mode: "insensitive" } },
          { admissionNumber: { contains: search, mode: "insensitive" } },
        ],
      },
    } : {}),
  };

  const whereTyped = where as Prisma.LedgerEntryWhereInput;

  // ── Parallel queries ───────────────────────────────────────────────────

  const [entries, total, accounts, invoicesByTerm] = await Promise.all([

    // 1. Paginated ledger entries — no longer need financeAccount here;
    //    outstanding is computed per-term server-side in termBatchStats.
    prisma.ledgerEntry.findMany({
      where:   whereTyped,
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id: true, entryType: true, amount: true, description: true,
        referenceId: true, referenceType: true, paymentMethod: true,
        postedAt: true, isVoided: true,
        student: { select: { id: true, fullName: true, admissionNumber: true } },
        term:    { select: { id: true, name: true } },
      },
    }),

    // 2. Total count for pagination
    prisma.ledgerEntry.count({ where: whereTyped }),

    // 3. School-wide outstanding: sum of negative balances (what ALL students owe)
    prisma.studentFinanceAccount.aggregate({
      where: { schoolId, currentBalance: { lt: 0 } },
      _sum:  { currentBalance: true, totalInvoiced: true, totalPaid: true },
    }),

    // 4. Per-term batch stats: for each term with invoices, get:
    //    - count of students invoiced
    //    - sum of invoice amounts (frozen total at invoice-generation time)
    //    - earliest invoice timestamp (used as the batch postedAt)
    //    Then join with StudentFinanceAccount to get live outstanding per student.
    //
    //    We load all terms' invoices for this school (or for the filtered term
    //    if a termId filter is active). This is a small dataset — one row per
    //    student per term — so it is fast even without pagination.
    prisma.invoice.findMany({
      where: {
        schoolId,
        ...(termId ? { termId } : {}),
      },
      select: {
        termId:      true,
        totalAmount: true,
        generatedAt: true,
        student: {
          select: {
            financeAccount: { select: { currentBalance: true } },
          },
        },
        term: { select: { name: true } },
      },
      orderBy: { generatedAt: "asc" },
    }),
  ]);

  // ── Build termBatchStats from the invoice + financeAccount join ────────
  //
  // For each termId:
  //   outstanding = SUM(abs(currentBalance)) for students with currentBalance < 0
  //   invoiced    = SUM(invoice.totalAmount)  — the original charged amounts
  //   count       = number of invoices (= number of students invoiced)
  //   postedAt    = earliest generatedAt in the term (the batch creation timestamp)
  //
  // This is the live figure: as students pay, currentBalance moves toward 0,
  // and outstanding decreases in real time without any manual recalculation.
  // Carry-forward is already baked into currentBalance — it is never reset
  // between terms.

  type TermBatchStat = {
    outstanding: string;
    invoiced:    string;
    count:       number;
    postedAt:    string;
    termName:    string;
  };

  const termStatsMap = new Map<string, {
    outstanding: Decimal;
    invoiced:    Decimal;
    count:       number;
    postedAt:    Date;
    termName:    string;
  }>();

  for (const inv of invoicesByTerm) {
    if (!inv.termId) continue;
    const existing = termStatsMap.get(inv.termId);
    const balance  = new Decimal(inv.student.financeAccount?.currentBalance?.toString() ?? "0");
    // Only count the student's debt (negative balance) toward outstanding.
    // Overpayments (positive balance) correctly net to zero contribution — they
    // reduce what the school needs to collect, and the school-wide stats reflect
    // that separately.
    const studentOwes = balance.isNegative() ? balance.abs() : new Decimal(0);

    if (existing) {
      existing.outstanding = existing.outstanding.plus(studentOwes);
      existing.invoiced    = existing.invoiced.plus(new Decimal(inv.totalAmount.toString()));
      existing.count      += 1;
      // Keep earliest generatedAt as the batch postedAt
      if (inv.generatedAt < existing.postedAt) existing.postedAt = inv.generatedAt;
    } else {
      termStatsMap.set(inv.termId, {
        outstanding: studentOwes,
        invoiced:    new Decimal(inv.totalAmount.toString()),
        count:       1,
        postedAt:    inv.generatedAt,
        termName:    inv.term.name,
      });
    }
  }

  const termBatchStats: Record<string, TermBatchStat> = {};
  for (const [tId, stat] of termStatsMap.entries()) {
    termBatchStats[tId] = {
      outstanding: stat.outstanding.toString(),
      invoiced:    stat.invoiced.toString(),
      count:       stat.count,
      postedAt:    stat.postedAt.toISOString(),
      termName:    stat.termName,
    };
  }

  // ── School-wide totals ─────────────────────────────────────────────────
  const totalInvoiced   = new Decimal(accounts._sum.totalInvoiced?.toString()  ?? "0");
  const totalPaid       = new Decimal(accounts._sum.totalPaid?.toString()       ?? "0");
  const outstandingDebt = new Decimal(accounts._sum.currentBalance?.toString()  ?? "0").abs();

  return NextResponse.json({
    entries: entries.map((e) => ({
      ...e,
      amount: e.amount.toString(),
    })),
    total,
    page,
    pageSize,
    // Stable school-wide aggregates — same value regardless of which page is loaded
    schoolStats: {
      totalInvoiced:    totalInvoiced.toString(),
      totalPaid:        totalPaid.toString(),
      totalOutstanding: outstandingDebt.toString(),
    },
    // Per-term live batch outstanding — keyed by termId.
    // The UI uses this to render the batch invoice summary row amount.
    termBatchStats,
  });
}
