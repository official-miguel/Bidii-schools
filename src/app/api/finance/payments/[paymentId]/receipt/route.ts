/**
 * GET /api/finance/payments/[paymentId]/receipt — Receipt payload
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function GET(_req: NextRequest, { params }: { params: { paymentId: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const payment = await prisma.payment.findFirst({
    where:  { id: params.paymentId, schoolId },
    select: {
      id: true, amount: true, method: true, reference: true, receiptNumber: true, paidAt: true, reconciliationStatus: true,
      studentId: true,
      student: { select: { fullName: true, admissionNumber: true, schoolClass: { select: { name: true } } } },
      term:    { select: { name: true } },
      // Never expose mpesaRawPayload
    },
  });
  if (!payment) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Get current balance from StudentFinanceAccount
  const account = await prisma.studentFinanceAccount.findUnique({
    where:  { schoolId_studentId: { schoolId, studentId: payment.studentId } },
    select: { currentBalance: true },
  });

  return NextResponse.json({
    receipt: {
      receiptNumber:    payment.receiptNumber,
      studentFullName:  payment.student?.fullName,
      admissionNumber:  payment.student?.admissionNumber,
      className:        payment.student?.schoolClass?.name,
      termName:         payment.term?.name,
      amount:           payment.amount.toString(),
      method:           payment.method,
      reference:        payment.reference,
      paidAt:           payment.paidAt,
      currentBalance:   account?.currentBalance?.toString() ?? "0",
    },
  });
}
