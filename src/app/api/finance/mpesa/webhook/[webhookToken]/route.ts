/**
 * POST /api/finance/mpesa/webhook/[webhookToken]
 *
 * Public endpoint — no session cookie auth.
 * Authentication is via HMAC-SHA256 signature on the request body.
 *
 * Daraja C2B confirmation flow:
 *  1. Verify HMAC signature
 *  2. Check idempotency (mpesaTransactionId)
 *  3. Match rawAccountNumber to admission number
 *  4. Auto-credit (exact match) or queue (fuzzy/no match)
 *  5. Always return HTTP 200 to Daraja after HMAC passes
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { verifyHmac, matchAdmissionNumber } from "@/lib/finance/mpesa";
import { decryptSecret } from "@/lib/crypto";
import { postLedgerEntry } from "@/lib/finance/ledger";
import { nextReceiptNumber } from "@/lib/finance/receipts";

export async function POST(req: NextRequest, { params }: { params: { webhookToken: string } }) {
  // 1. Look up school by webhook token
  const financeSettings = await prisma.financeSettings.findFirst({
    where:  { mpesaWebhookUrl: { contains: params.webhookToken } },
    select: { schoolId: true, mpesaWebhookSecret: true, receiptPrefix: true },
  });

  if (!financeSettings?.mpesaWebhookSecret) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Unauthorized" }, { status: 401 });
  }

  // 2. Read raw body for HMAC verification
  const rawBody  = await req.text();
  const sig      = req.headers.get("x-mpesa-signature") ?? "";
  const secret   = decryptSecret(financeSettings.mpesaWebhookSecret);

  if (!verifyHmac(secret, rawBody, sig)) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid signature" }, { status: 401 });
  }

  // Always return 200 to Daraja from here on (even on duplicates)
  const { schoolId, receiptPrefix } = financeSettings;

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }); }

  const mpesaTransactionId = String(payload.TransID ?? payload.transID ?? "");
  const rawAccountNumber   = String(payload.BillRefNumber ?? payload.AccountReference ?? "");
  const amountStr          = String(payload.TransAmount ?? payload.Amount ?? "0");
  const paidAt             = new Date(String(payload.TransTime ?? Date.now()));
  const amount             = new Decimal(amountStr.replace(/[^0-9.]/g, "") || "0");

  if (!mpesaTransactionId) return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

  // 3. Idempotency check
  const [existingEntry, existingQueue] = await Promise.all([
    prisma.ledgerEntry.findUnique({ where: { mpesaTransactionId }, select: { id: true } }),
    prisma.mpesaReconciliationQueue.findUnique({ where: { mpesaTransactionId }, select: { id: true } }),
  ]);
  if (existingEntry || existingQueue) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }); // idempotent
  }

  // 4. Load all admission numbers for fuzzy matching
  const allStudents = await prisma.student.findMany({
    where:  { schoolId, archivedAt: null },
    select: { id: true, admissionNumber: true },
  });

  const matchResult = matchAdmissionNumber(
    allStudents.map((s) => ({ admissionNumber: s.admissionNumber, studentId: s.id })),
    rawAccountNumber
  );

  const prefix = receiptPrefix ?? "REC-";

  if (matchResult?.confidence === 1.0) {
    // 5a. Exact match — auto-credit
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL app.current_school_id = ${schoolId}`;

        const receiptNumber = await nextReceiptNumber(tx, schoolId, prefix);

        await tx.payment.create({
          data: {
            schoolId, studentId: matchResult.studentId!, termId: null,
            amount, method: "MPESA",
            mpesaTransactionId,
            mpesaRawPayload: payload as object,
            receiptNumber,
            paidAt,
            postedById: "system", // system-generated
            reconciliationStatus: "AUTO_MATCHED",
          },
        });

        await postLedgerEntry(tx, {
          schoolId, studentId: matchResult.studentId!,
          entryType:         "PAYMENT",
          amount,
          description:       `M-Pesa C2B ${mpesaTransactionId}`,
          referenceId:       mpesaTransactionId,
          referenceType:     "PAYMENT",
          paymentMethod:     "MPESA",
          mpesaTransactionId,
          postedById:        "system",
        });

        await tx.financeNotification.create({
          data: { schoolId, studentId: matchResult.studentId!, type: "PAYMENT_RECEIVED", message: `M-Pesa payment ${mpesaTransactionId} auto-credited — KES ${amount.toFixed(2)}` },
        });
      });
    } catch (err) {
      console.error("[MPESA/WEBHOOK] auto-credit failed:", err);
    }
  } else {
    // 5b. Fuzzy or no match — queue for manual reconciliation
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL app.current_school_id = ${schoolId}`;

        await tx.mpesaReconciliationQueue.create({
          data: {
            schoolId, mpesaTransactionId, rawAccountNumber, amount, paidAt,
            rawPayload:          payload as object,
            suggestedStudentId:  matchResult?.studentId ?? null,
            suggestedConfidence: matchResult?.confidence ?? null,
            status:              "PENDING",
          },
        });

        await tx.financeNotification.create({
          data: { schoolId, studentId: null, type: "RECONCILIATION_NEEDED", message: `Unmatched M-Pesa payment ${mpesaTransactionId} — KES ${amount.toFixed(2)} from "${rawAccountNumber}" requires manual reconciliation.` },
        });
      });
    } catch (err) {
      console.error("[MPESA/WEBHOOK] queue failed:", err);
    }
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
