/**
 * POST /api/finance/c2b/[webhookToken]
 *
 * Public endpoint — no session cookie auth.
 * Authentication is via HMAC-SHA256 signature on the request body (production).
 * Sandbox: no signature header is sent by Safaricom, so HMAC is skipped when
 * no webhook secret is configured on the paybill.
 *
 * URL deliberately avoids the word "mpesa" — Safaricom Daraja rejects any
 * Confirmation/Validation URL that contains that word.
 *
 * Daraja C2B confirmation flow:
 *  1. Look up school by webhook token
 *  2. Verify HMAC signature (if secret configured)
 *  3. Parse body — Safaricom TransTime is YYYYMMDDHHmmss, not ISO
 *  4. Idempotency check on mpesaTransactionId
 *  5. Fuzzy-match BillRefNumber → admission number
 *  6a. Exact match  → auto-credit (Payment + LedgerEntry)
 *  6b. No/fuzzy match → queue for Bursar reconciliation
 *  7. Always return HTTP 200 { ResultCode: 0 } to Daraja
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { verifyHmac, matchAdmissionNumber } from "@/lib/finance/mpesa";
import { decryptSecret } from "@/lib/crypto";
import { postLedgerEntry } from "@/lib/finance/ledger";
import { nextReceiptNumber } from "@/lib/finance/receipts";

const OK = { ResultCode: 0, ResultDesc: "Accepted" } as const;

// GET — health check: open the webhook URL in a browser to confirm it resolves.
export async function GET(req: NextRequest, { params }: { params: { webhookToken: string } }) {
  const paybill = await prisma.schoolMpesaPaybill.findFirst({
    where:  { webhookUrl: params.webhookToken, isActive: true },
    select: { schoolId: true, paybillNumber: true, label: true },
  });
  return NextResponse.json({
    ok:          true,
    schoolFound: !!paybill,
    paybill:     paybill ? { label: paybill.label, paybillNumber: paybill.paybillNumber } : null,
  });
}

export async function POST(req: NextRequest, { params }: { params: { webhookToken: string } }) {
  const token = params.webhookToken;

  // 1. Look up school by webhook token (new paybill table or legacy settings row)
  const [legacySettings, paybillRecord] = await Promise.all([
    prisma.financeSettings.findFirst({
      where:  { mpesaWebhookUrl: { contains: token } },
      select: { schoolId: true, mpesaWebhookSecret: true, receiptPrefix: true },
    }),
    prisma.schoolMpesaPaybill.findFirst({
      where:  { webhookUrl: token, isActive: true },
      select: {
        schoolId:     true,
        webhookSecret: true,
        school: { select: { financeSettings: { select: { receiptPrefix: true } } } },
      },
    }),
  ]);

  const schoolId      = legacySettings?.schoolId      ?? paybillRecord?.schoolId;
  const rawSecret     = legacySettings?.mpesaWebhookSecret ?? paybillRecord?.webhookSecret;
  const receiptPrefix = legacySettings?.receiptPrefix
    ?? paybillRecord?.school?.financeSettings?.receiptPrefix
    ?? "REC-";

  if (!schoolId) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Unauthorized" }, { status: 401 });
  }

  // 2. Read raw body
  const rawBody = await req.text();

  // HMAC verification — only when a secret is configured AND the header is present.
  // Daraja sandbox never sends x-mpesa-signature.
  if (rawSecret) {
    const sig = req.headers.get("x-mpesa-signature") ?? "";
    if (sig && !verifyHmac(decryptSecret(rawSecret), rawBody, sig)) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid signature" }, { status: 401 });
    }
  }

  // 3. Parse body
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json(OK); }

  const mpesaTransactionId = String(payload.TransID   ?? payload.transID         ?? "");
  const rawAccountNumber   = String(payload.BillRefNumber ?? payload.AccountReference ?? "");
  const amountStr          = String(payload.TransAmount ?? payload.Amount          ?? "0");
  const amount             = new Decimal(amountStr.replace(/[^0-9.]/g, "") || "0");

  // Safaricom TransTime format: YYYYMMDDHHmmss (not ISO)
  const t = String(payload.TransTime ?? "");
  const paidAt = /^\d{14}$/.test(t)
    ? new Date(`${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}T${t.slice(8,10)}:${t.slice(10,12)}:${t.slice(12,14)}`)
    : new Date();

  if (!mpesaTransactionId) return NextResponse.json(OK);

  // 4. Idempotency — prevent duplicate processing
  const [existingEntry, existingQueue] = await Promise.all([
    prisma.ledgerEntry.findUnique({ where: { mpesaTransactionId }, select: { id: true } }),
    prisma.mpesaReconciliationQueue.findUnique({ where: { mpesaTransactionId }, select: { id: true } }),
  ]);
  if (existingEntry || existingQueue) return NextResponse.json(OK);

  // 5. Fuzzy-match admission number
  const allStudents = await prisma.student.findMany({
    where:  { schoolId, archivedAt: null },
    select: { id: true, admissionNumber: true },
  });
  const matchResult = matchAdmissionNumber(
    allStudents.map(s => ({ admissionNumber: s.admissionNumber, studentId: s.id })),
    rawAccountNumber
  );

  const prefix = receiptPrefix ?? "REC-";

  if (matchResult?.confidence === 1.0) {
    // 6a. Exact match — look up a real user for the postedById FK
    const systemUser = await prisma.user.findFirst({
      where:   { schoolId, isActive: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select:  { id: true },
    });

    if (systemUser) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL app.current_school_id = '${schoolId}'`);
          const receiptNumber = await nextReceiptNumber(tx, schoolId, prefix);

          await tx.payment.create({
            data: {
              schoolId, studentId: matchResult.studentId!, termId: null,
              amount, method: "MPESA", mpesaTransactionId,
              mpesaRawPayload: payload as object,
              receiptNumber, paidAt,
              postedById:           systemUser.id,
              reconciliationStatus: "AUTO_MATCHED",
            },
          });

          await postLedgerEntry(tx, {
            schoolId, studentId: matchResult.studentId!,
            entryType: "PAYMENT", amount,
            description:       `M-Pesa C2B ${mpesaTransactionId}`,
            referenceId:       mpesaTransactionId,
            referenceType:     "PAYMENT",
            paymentMethod:     "MPESA",
            mpesaTransactionId,
            postedById:        systemUser.id,
          });

          await tx.financeNotification.create({
            data: {
              schoolId, studentId: matchResult.studentId!,
              type:    "PAYMENT_RECEIVED",
              message: `M-Pesa payment ${mpesaTransactionId} auto-credited — KES ${amount.toFixed(2)}`,
            },
          });
        });
        return NextResponse.json(OK);
      } catch (err) {
        console.error("[C2B] auto-credit failed, falling back to queue:", err);
        // Fall through to queue on error
      }
    }
  }

  // 6b. No/fuzzy match (or auto-credit fallback) — queue for reconciliation
  try {
    await prisma.mpesaReconciliationQueue.create({
      data: {
        schoolId, mpesaTransactionId, rawAccountNumber, amount, paidAt,
        rawPayload:          payload as object,
        suggestedStudentId:  matchResult?.studentId   ?? null,
        suggestedConfidence: matchResult?.confidence  ?? null,
        status:              "PENDING",
      },
    });

    // Notification is best-effort
    prisma.financeNotification.create({
      data: {
        schoolId, studentId: null,
        type:    "RECONCILIATION_NEEDED",
        message: `Unmatched M-Pesa payment ${mpesaTransactionId} — KES ${amount.toFixed(2)} from "${rawAccountNumber}" needs reconciliation.`,
      },
    }).catch(() => {});

  } catch (err) {
    console.error("[C2B] queue insert failed:", err);
  }

  return NextResponse.json(OK);
}
