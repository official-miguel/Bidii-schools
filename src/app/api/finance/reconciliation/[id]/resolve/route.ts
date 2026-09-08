/**
 * POST /api/finance/reconciliation/[id]/resolve — Manually reconcile an M-Pesa payment
 *
 * If studentId is omitted the route will attempt to auto-match the queue
 * item's rawAccountNumber against existing student admission numbers.
 * This handles the common case where a student was enrolled after the
 * payment was queued and the match can now be resolved automatically.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { postLedgerEntry } from "@/lib/finance/ledger";
import { nextReceiptNumber } from "@/lib/finance/receipts";
import { matchAdmissionNumber } from "@/lib/finance/mpesa";

const resolveSchema = z.object({
  // studentId is optional — if omitted the route auto-matches from rawAccountNumber
  studentId: z.string().trim().min(1).optional(),
  termId:    z.string().trim().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;
  // PRINCIPAL can confirm matches — only restrict write-sensitive ops if needed

  const queueItem = await prisma.mpesaReconciliationQueue.findFirst({
    where: { id: params.id, schoolId, status: "PENDING" },
    select: { id: true, mpesaTransactionId: true, amount: true, rawPayload: true, paidAt: true, rawAccountNumber: true },
  });
  if (!queueItem) return NextResponse.json({ error: "Reconciliation item not found or already resolved." }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); }
  catch { body = {}; }

  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  let { studentId } = parsed.data as { studentId?: string; termId?: string };
  const { termId }  = parsed.data as { studentId?: string; termId?: string };

  // ── Auto-match: if no studentId was provided, try to find the student
  // from the rawAccountNumber (exact → normalised → fuzzy). This handles
  // the case where the admission number exists in the system but the payment
  // was queued before the student was enrolled or due to a minor formatting
  // difference that now resolves to an exact match.
  if (!studentId) {
    const raw          = queueItem.rawAccountNumber;
    const normalisedRef = raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

    // 1. Exact match on raw account number (case-insensitive)
    let autoStudent = await prisma.student.findFirst({
      where: { schoolId, archivedAt: null, admissionNumber: { equals: raw, mode: "insensitive" } },
      select: { id: true },
    });

    // 2. Normalised match (strips punctuation/slashes)
    if (!autoStudent && normalisedRef.length > 0) {
      autoStudent = await prisma.student.findFirst({
        where: { schoolId, archivedAt: null, admissionNumber: { equals: normalisedRef, mode: "insensitive" } },
        select: { id: true },
      });
    }

    // 3. Prefix fuzzy match on a small candidate set
    if (!autoStudent && normalisedRef.length >= 3) {
      const prefixStr   = normalisedRef.slice(0, Math.min(normalisedRef.length, 6));
      const candidates  = await prisma.student.findMany({
        where: { schoolId, archivedAt: null, admissionNumber: { startsWith: prefixStr, mode: "insensitive" } },
        select: { id: true, admissionNumber: true },
        take: 20,
      });
      if (candidates.length > 0) {
        const fuzzy = matchAdmissionNumber(
          candidates.map((s) => ({ admissionNumber: s.admissionNumber, studentId: s.id })),
          raw,
        );
        // Only auto-resolve on a full confidence match; anything lower needs human confirmation
        if (fuzzy?.confidence === 1.0 && fuzzy.studentId) {
          autoStudent = { id: fuzzy.studentId };
        }
      }
    }

    if (!autoStudent) {
      return NextResponse.json(
        { error: "Could not automatically match the account reference to a student. Please select the student manually." },
        { status: 422 }
      );
    }
    studentId = autoStudent.id;
  }

  const student = await prisma.student.findFirst({ where: { id: studentId!, schoolId, archivedAt: null }, select: { id: true } });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  // At this point studentId is guaranteed to be a non-empty string
  const resolvedStudentId = studentId!;
  const settings = await prisma.financeSettings.findUnique({ where: { schoolId }, select: { receiptPrefix: true } });
  const prefix   = settings?.receiptPrefix ?? "REC-";

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.current_school_id" = '${schoolId.replace(/[^a-zA-Z0-9_\-]/g, "")}'`);

      const receiptNumber = await nextReceiptNumber(tx, schoolId, prefix);
      const amount        = new Decimal(queueItem.amount.toString());

      // Create Payment row
      await tx.payment.create({
        data: {
          schoolId, studentId: resolvedStudentId, termId: termId ?? null,
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
        schoolId, studentId: resolvedStudentId, termId,
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
        data:  { status: "RESOLVED", resolvedById: user.id, resolvedAt: new Date(), resolvedStudentId: resolvedStudentId },
      });

      // Notification
      await tx.financeNotification.create({
        data: { schoolId, studentId: resolvedStudentId, type: "PAYMENT_RECEIVED", message: `M-Pesa ${queueItem.mpesaTransactionId} manually reconciled — ${amount.toFixed(2)}` },
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
