/**
 * GET /api/finance/ledger — Paginated school-wide ledger with filtering
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import type { LedgerEntryType } from "@prisma/client";

const VALID_ENTRY_TYPES = new Set<string>([
  "INVOICE", "PAYMENT", "CREDIT_ADJUSTMENT", "DEBIT_ADJUSTMENT", "OPENING_BALANCE",
]);

export async function GET(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const { searchParams } = new URL(req.url);
  const studentId       = searchParams.get("studentId");
  const termId          = searchParams.get("termId");
  const entryTypeRaw    = searchParams.get("entryType");
  const entryType       = entryTypeRaw && VALID_ENTRY_TYPES.has(entryTypeRaw)
    ? (entryTypeRaw as LedgerEntryType)
    : null;
  const fromDate  = searchParams.get("fromDate");
  const toDate    = searchParams.get("toDate");
  const isVoidedParam = searchParams.get("isVoided");
  const isVoided =
    isVoidedParam === "true"  ? true  :
    isVoidedParam === "false" ? false : undefined;
  const page     = Math.max(1, parseInt(searchParams.get("page")     ?? "1",  10));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

  const where = {
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
  };

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { postedAt: "desc" },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id: true, entryType: true, amount: true, description: true,
        referenceId: true, referenceType: true, paymentMethod: true,
        postedAt: true, isVoided: true,
        student:  { select: { fullName: true, admissionNumber: true } },
        term:     { select: { name: true } },
        postedBy: { select: { id: true } },
      },
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  return NextResponse.json({
    entries: entries.map((e) => ({
      ...e,
      amount: e.amount.toString(),
      voided: e.isVoided,
    })),
    total,
    page,
    pageSize,
  });
}
