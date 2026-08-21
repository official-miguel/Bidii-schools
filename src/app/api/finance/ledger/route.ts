/**
 * GET /api/finance/ledger — Paginated school-wide ledger with filtering and running balance
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
  const fromDate       = searchParams.get("fromDate");
  const toDate         = searchParams.get("toDate");
  const isVoidedParam  = searchParams.get("isVoided");
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
    // Name / admission number search
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

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where:   whereTyped,
      orderBy: { postedAt: "desc" },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id: true, entryType: true, amount: true, description: true,
        referenceId: true, referenceType: true, paymentMethod: true,
        postedAt: true, isVoided: true,
        student:  { select: { id: true, fullName: true, admissionNumber: true } },
        term:     { select: { name: true } },
        postedBy: { select: { id: true } },
      },
    }),
    prisma.ledgerEntry.count({ where: whereTyped }),
  ]);

  // Compute school-wide running balance up to and including each page entry.
  // We need the balance just BEFORE the first entry on this page, then walk
  // forward (oldest-first) adding deltas, then reverse back to desc order.
  //
  // School balance rule (opposite of per-student):
  //   PAYMENT / CREDIT_ADJUSTMENT → school receives money → +amount
  //   INVOICE / DEBIT_ADJUSTMENT / OPENING_BALANCE → school is owed more → treated as pending (+amount for display)
  //
  // For the "school total received" running balance we track:
  //   PAYMENT / CREDIT_ADJUSTMENT = +  (cash in)
  //   INVOICE                     = -  (money goes out as a debt obligation)
  //   DEBIT_ADJUSTMENT            = -
  //   OPENING_BALANCE             = -

  // Sum of all non-voided entries AFTER the current page (older entries)
  // to get the balance at the start of this page.
  let balanceBeforePage = new Decimal(0);
  if (entries.length > 0) {
    // The oldest entry on this page — everything before this (older) was
    // already processed in previous pages.
    const oldestOnPage  = entries[entries.length - 1].postedAt;
    const olderEntries  = await prisma.ledgerEntry.findMany({
      where: {
        schoolId,
        isVoided: false,
        postedAt: { lt: oldestOnPage },
      } as Prisma.LedgerEntryWhereInput,
      select: { entryType: true, amount: true },
    });
    for (const e of olderEntries) {
      const amt = new Decimal(e.amount.toString());
      if (e.entryType === "PAYMENT" || e.entryType === "CREDIT_ADJUSTMENT") {
        balanceBeforePage = balanceBeforePage.plus(amt);
      } else {
        balanceBeforePage = balanceBeforePage.minus(amt);
      }
    }
  }

  // Walk entries oldest-first to build running totals, then reverse.
  const reversed = [...entries].reverse();
  let running = balanceBeforePage;
  const runningMap = new Map<string, string>();
  for (const e of reversed) {
    if (!e.isVoided) {
      const amt = new Decimal(e.amount.toString());
      if (e.entryType === "PAYMENT" || e.entryType === "CREDIT_ADJUSTMENT") {
        running = running.plus(amt);
      } else {
        running = running.minus(amt);
      }
    }
    runningMap.set(e.id, running.toString());
  }

  return NextResponse.json({
    entries: entries.map((e) => ({
      ...e,
      amount:         e.amount.toString(),
      runningBalance: runningMap.get(e.id) ?? "0",
      voided:         e.isVoided,
    })),
    total,
    page,
    pageSize,
  });
}
