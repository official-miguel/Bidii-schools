/**
 * POST /api/finance/reconciliation/[id]/resolve — Manually reconcile an M-Pesa payment
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { postLedgerEntry } from "@/lib/finance/ledger";
import { nextReceiptNumber } from "@/lib/finance/receipts";

const resolveSchema = z.object({
  studentId: z.string().trim().min(1, "Student ID is required."),
  termId:    z.string().trim().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;
  if (user.role === "PRINCIPAL") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const queueItem = await prisma.mpesaReconciliationQueue.findFirst({
    where: { id: params.id, schoolId, status: "PENDING" },
    select: { id: true, mpesaTransactionId: true, amount: true, rawPayload: true, paidAt: true },
  });
  if (!queueItem) return NextResponse.json({ error: "Reconciliation item not found or already resolved." }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const { studentId, termId } = parsed.data;

  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId, archivedAt: null }, select: { id: true } });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const settings = await prisma.financeSettings.findUnique({ where: { schoolId }, select: { receiptPrefix: true } });
  const prefix   = settings?.receiptPrefix ?? "REC-";

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_school_id = '${schoolId}'`);

      const receiptNumber = await nextReceiptNumber(tx, schoolId, prefix);
      const amount        = new Decimal(queueItem.amount.toString());

      // Create Payment row
      await tx.payment.create({
        data: {
          schoolId, studentId, termId: termId ?? null,
          amount,
          method:               "MPESA",
          mpesaTransactionId:   queueItem.mpesaTransactionId,
          mpesaRawPayload:      queueItem.rawPayload as object,
          receiptNumber,
          paidAt:               queueItem.paidAt,
          postedById:           user.id,
          reconciliationStatus: "MANUAL_RECONCILED",
        },
      });

      // Post ledger entry
      await postLedgerEntry(tx, {
        schoolId, studentId, termId,
        entryType:          "PAYMENT",
        amount,
        description:        `M-Pesa payment ${queueItem.mpesaTransactionId} (manually reconciled)`,
        referenceId:        queueItem.mpesaTransactionId,
        referenceType:      "PAYMENT",
        paymentMethod:      "MPESA",
        mpesaTransactionId: queueItem.mpesaTransactionId,
        postedById:         user.id,
      });

      // Mark queue item as resolved
      await tx.mpesaReconciliationQueue.update({
        where: { id: queueItem.id },
        data:  { status: "RESOLVED", resolvedById: user.id, resolvedAt: new Date(), resolvedStudentId: studentId },
      });

      // Notification
      await tx.financeNotification.create({
        data: { schoolId, studentId, type: "PAYMENT_RECEIVED", message: `M-Pesa ${queueItem.mpesaTransactionId} manually reconciled — ${amount.toFixed(2)}` },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    // P2002 = unique constraint violation — surface which constraint, not a generic message
    if (e.code === "P2002") {
      const meta = (err as { meta?: { target?: string[] } }).meta;
      const field = meta?.target?.join(", ") ?? "unknown field";
      // If it's the mpesaTransactionId constraint, the payment truly exists already
      if (field.includes("mpesaTransactionId")) {
        return NextResponse.json({ error: "This M-Pesa transaction has already been processed." }, { status: 409 });
      }
      // Any other constraint (e.g. receiptNumber race) — report it clearly
      console.error("[FINANCE/RECONCILIATION/RESOLVE] P2002 on:", field, err);
      return NextResponse.json({ error: `Database constraint violation on ${field}. Please try again.` }, { status: 409 });
    }
    console.error("[FINANCE/RECONCILIATION/RESOLVE]", err);
    return NextResponse.json({ error: `An unexpected error occurred: ${e.message ?? String(err)}` }, { status: 500 });
  }
}
