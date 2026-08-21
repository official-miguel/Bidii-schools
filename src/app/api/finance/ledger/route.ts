/**
 * GET /api/finance/ledger — Paginated school-wide ledger
 *
 * Returns entries in descending order + a single stable outstanding balance
 * computed from StudentFinanceAccount aggregates (sum of all currentBalance
 * where currentBalance < 0 = what students owe).
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

  // Fetch entries and total in parallel, plus the stable school outstanding balance
  const [entries, total, accounts] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where:   whereTyped,
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id: true, entryType: true, amount: true, description: true,
        referenceId: true, referenceType: true, paymentMethod: true,
        postedAt: true, isVoided: true,
        student:  {
          select: {
            id: true, fullName: true, admissionNumber: true,
            financeAccount: { select: { currentBalance: true } },
          },
        },
        term:     { select: { name: true } },
      },
    }),
    prisma.ledgerEntry.count({ where: whereTyped }),
    // Aggregate total outstanding: sum of negative balances (what students owe)
    prisma.studentFinanceAccount.aggregate({
      where:  { schoolId, currentBalance: { lt: 0 } },
      _sum:   { currentBalance: true, totalInvoiced: true, totalPaid: true },
    }),
  ]);

  // Stable outstanding = abs(sum of negative balances)
  const totalInvoiced   = new Decimal(accounts._sum.totalInvoiced?.toString()  ?? "0");
  const totalPaid       = new Decimal(accounts._sum.totalPaid?.toString()       ?? "0");
  const outstandingDebt = new Decimal(accounts._sum.currentBalance?.toString()  ?? "0").abs();

  return NextResponse.json({
    entries: entries.map((e) => ({
      ...e,
      amount: e.amount.toString(),
      student: e.student
        ? {
            ...e.student,
            financeAccount: e.student.financeAccount
              ? { currentBalance: e.student.financeAccount.currentBalance.toString() }
              : null,
          }
        : null,
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
  });
}
