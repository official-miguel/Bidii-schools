/**
 * POST /api/finance/payments — Post a manual payment (cash, bank transfer, or cheque)
 * GET  /api/finance/payments — List recent payments
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { postLedgerEntry } from "@/lib/finance/ledger";
import { nextReceiptNumber } from "@/lib/finance/receipts";
import { notifyParents } from "@/lib/parentNotifications";

const createPaymentSchema = z.object({
  studentId: z.string().trim().min(1, "Student ID is required."),
  termId:    z.string().trim().optional(),
  amount:    z.number().positive("Amount must be greater than zero."),
  method:    z.enum(["CASH", "BANK_TRANSFER", "CHEQUE"]),
  reference: z.string().trim().optional().nullable(),
  paidAt:    z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;
  if (user.role === "PRINCIPAL") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const { studentId, termId, amount, method, reference, paidAt } = parsed.data;

  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId, archivedAt: null }, select: { id: true, fullName: true } });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const settings = await prisma.financeSettings.findUnique({ where: { schoolId }, select: { receiptPrefix: true } });
  const prefix   = settings?.receiptPrefix ?? "REC-";

  let receiptNumber = "";
  let paymentId = "";

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_school_id = '${schoolId}'`);

      receiptNumber = await nextReceiptNumber(tx, schoolId, prefix);
      const amountDecimal = new Decimal(amount.toString());

      const payment = await tx.payment.create({
        data: {
          schoolId, studentId, termId: termId ?? null,
          amount: amountDecimal, method,
          reference: reference ?? null,
          receiptNumber,
          paidAt:    paidAt ? new Date(paidAt) : new Date(),
          postedById: user.id,
          reconciliationStatus: "PENDING",
        },
        select: { id: true },
      });
      paymentId = payment.id;

      await postLedgerEntry(tx, {
        schoolId, studentId, termId,
        entryType:    "PAYMENT",
        amount:       amountDecimal,
        description:  `Manual payment — ${method} — Receipt ${receiptNumber}`,
        referenceId:  receiptNumber,
        referenceType: "PAYMENT",
        paymentMethod: method,
        postedById:   user.id,
      });

      await tx.financeNotification.create({
        data: { schoolId, studentId, type: "PAYMENT_RECEIVED", message: `Payment of KES ${amount.toFixed(2)} received (${method}) — Receipt ${receiptNumber}` },
      });
    });

    // Fire parent notification outside the transaction (fire-and-forget)
    void notifyParents({
      schoolId,
      studentId,
      module:   "FEES",
      priority: "LOW",
      title:    "Payment Received",
      body:     `KSh ${amount.toFixed(2)} has been recorded.`,
      dedupKey: `payment-${paymentId}`,
    }).catch(() => {});

    return NextResponse.json({ paymentId, receiptNumber }, { status: 201 });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return NextResponse.json({ error: "A payment with that receipt number already exists." }, { status: 409 });
    console.error("[FINANCE/PAYMENTS POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize  = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

  const payments = await prisma.payment.findMany({
    where:   { schoolId, ...(studentId ? { studentId } : {}) },
    orderBy: { paidAt: "desc" },
    skip:    (page - 1) * pageSize,
    take:    pageSize,
    select:  { id: true, studentId: true, amount: true, method: true, receiptNumber: true, paidAt: true, reconciliationStatus: true, reference: true, student: { select: { fullName: true, admissionNumber: true } } },
  });

  return NextResponse.json({ payments: payments.map((p) => ({ ...p, amount: p.amount.toString() })) });
}
