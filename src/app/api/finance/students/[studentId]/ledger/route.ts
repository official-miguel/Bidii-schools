/**
 * GET /api/finance/students/[studentId]/ledger — Individual student ledger with running balance
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { balanceDelta } from "@/lib/finance/ledger";
import type { LedgerEntryType } from "@prisma/client";

export async function GET(_req: NextRequest, { params }: { params: { studentId: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const student = await prisma.student.findFirst({
    where:  { id: params.studentId, schoolId },
    select: { id: true, fullName: true, admissionNumber: true, schoolClass: { select: { name: true, form: true } } },
  });
  if (!student) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [entries, invoices, payments, account] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where:   { schoolId, studentId: params.studentId },
      orderBy: { postedAt: "asc" },
      select:  { id: true, entryType: true, amount: true, description: true, referenceId: true, referenceType: true, postedAt: true, paymentMethod: true, isVoided: true, term: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where:   { schoolId, studentId: params.studentId },
      orderBy: { generatedAt: "desc" },
      select:  { id: true, invoiceNumber: true, totalAmount: true, lineItems: true, generatedAt: true, isProrated: true, proratedDays: true, term: { select: { name: true } } },
    }),
    prisma.payment.findMany({
      where:   { schoolId, studentId: params.studentId },
      orderBy: { paidAt: "desc" },
      select:  { id: true, receiptNumber: true, amount: true, method: true, paidAt: true, reference: true, reconciliationStatus: true, term: { select: { name: true } } },
    }),
    prisma.studentFinanceAccount.findUnique({
      where:  { schoolId_studentId: { schoolId, studentId: params.studentId } },
      select: { currentBalance: true, totalInvoiced: true, totalPaid: true, financeSetupCompletedAt: true, lastActivityAt: true },
    }),
  ]);

  // Compute running balance per entry
  let runningBalance = new Decimal(0);
  const entriesWithBalance = entries.map((e) => {
    if (!e.isVoided) {
      runningBalance = runningBalance.plus(balanceDelta(e.entryType as LedgerEntryType, new Decimal(e.amount.toString())));
    }
    return { ...e, amount: e.amount.toString(), runningBalance: runningBalance.toString() };
  });

  return NextResponse.json({
    student,
    account: account ? {
      ...account,
      currentBalance: account.currentBalance.toString(),
      totalInvoiced:  account.totalInvoiced.toString(),
      totalPaid:      account.totalPaid.toString(),
    } : null,
    entries:  entriesWithBalance,
    invoices: invoices.map((i) => ({ ...i, totalAmount: i.totalAmount.toString() })),
    payments: payments.map((p) => ({ ...p, amount: p.amount.toString() })),
  });
}
