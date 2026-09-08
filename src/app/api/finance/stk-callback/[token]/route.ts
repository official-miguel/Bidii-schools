/**
 * POST /api/finance/stk-callback/[token]
 *
 * Public endpoint — no session cookie auth.
 * Called by Safaricom Daraja after an STK Push completes (success or failure).
 *
 * URL deliberately avoids the word "mpesa" — Safaricom Daraja rejects any
 * callback URL containing that string.
 *
 * Flow:
 *  1. Look up school by stkCallbackToken
 *  2. Parse the Daraja STK callback body
 *  3. If ResultCode ≠ 0 → mark the StkPushRequest as FAILED and return 200
 *  4. Idempotency check on MpesaReceiptNumber (mpesaTransactionId)
 *  5. Resolve studentId from the StkPushRequest row (matched by CheckoutRequestID)
 *  6. Post Payment + LedgerEntry + FinanceNotification in a single transaction
 *     (mirrors the C2B auto-credit logic in /api/finance/c2b/[webhookToken])
 *  7. Mark StkPushRequest as COMPLETED
 *  8. Fire parent notification (fire-and-forget)
 *  9. Always respond HTTP 200 — Daraja retries on non-200
 *
 * Requirements: 7.4
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { postLedgerEntry } from "@/lib/finance/ledger";
import { nextReceiptNumber } from "@/lib/finance/receipts";
import { notifyParents } from "@/lib/parentNotifications";

// Daraja always expects HTTP 200 with this body — anything else triggers retries
const OK = NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

// ---------------------------------------------------------------------------
// Types — Daraja STK Push callback shape
// ---------------------------------------------------------------------------

interface StkCallbackItem {
  Name:  string;
  Value: string | number;
}

interface StkCallback {
  MerchantRequestID:  string;
  CheckoutRequestID:  string;
  ResultCode:         number;
  ResultDesc:         string;
  CallbackMetadata?: {
    Item: StkCallbackItem[];
  };
}

interface DarajaCallbackBody {
  Body: {
    stkCallback: StkCallback;
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;

  // 1. Look up school by stkCallbackToken
  const school = await prisma.school.findFirst({
    where:  { stkCallbackToken: token },
    select: {
      id: true,
      financeSettings: { select: { receiptPrefix: true } },
    },
  });

  if (!school) {
    // Don't reveal 404 — return OK so Daraja doesn't hammer an invalid token
    console.warn("[STK-CALLBACK] Unknown token:", token);
    return OK;
  }

  const schoolId      = school.id;
  const receiptPrefix = school.financeSettings?.receiptPrefix ?? "REC-";

  // 2. Parse body
  let payload: DarajaCallbackBody;
  try {
    payload = (await req.json()) as DarajaCallbackBody;
  } catch {
    return OK;
  }

  const stkCallback = payload?.Body?.stkCallback;
  if (!stkCallback) return OK;

  const {
    MerchantRequestID:  merchantRequestId,
    CheckoutRequestID:  checkoutRequestId,
    ResultCode:         resultCode,
    ResultDesc:         resultDesc,
    CallbackMetadata:   metadata,
  } = stkCallback;

  // 3. If the user cancelled or the request failed — mark it failed and exit
  if (resultCode !== 0) {
    await prisma.stkPushRequest
      .updateMany({
        where:  { checkoutRequestId, schoolId },
        data:   { status: "FAILED", failureReason: resultDesc },
      })
      .catch(() => {});
    return OK;
  }

  // 4. Extract fields from CallbackMetadata items
  const items: Record<string, string | number> = {};
  for (const item of metadata?.Item ?? []) {
    items[item.Name] = item.Value;
  }

  const mpesaReceiptNumber = String(items.MpesaReceiptNumber ?? "");
  const rawAmount          = Number(items.Amount ?? 0);
  const rawPhone           = String(items.PhoneNumber ?? "");

  if (!mpesaReceiptNumber || rawAmount <= 0) {
    console.error("[STK-CALLBACK] Missing receipt number or amount in callback metadata", items);
    return OK;
  }

  // 5. Idempotency — prevent duplicate processing
  const [existingEntry, existingPayment] = await Promise.all([
    prisma.ledgerEntry.findUnique({
      where:  { mpesaTransactionId: mpesaReceiptNumber },
      select: { id: true },
    }),
    prisma.payment.findFirst({
      where:  { mpesaTransactionId: mpesaReceiptNumber, schoolId },
      select: { id: true },
    }),
  ]);

  if (existingEntry || existingPayment) {
    // Already processed — idempotent OK
    return OK;
  }

  // 6. Resolve the StkPushRequest to get the studentId
  const stkRequest = await prisma.stkPushRequest.findFirst({
    where:  { checkoutRequestId, schoolId },
    select: { studentId: true, id: true },
  });

  if (!stkRequest?.studentId) {
    // No matching request row — attempt fallback reconciliation via phone
    console.warn("[STK-CALLBACK] No StkPushRequest found for CheckoutRequestID:", checkoutRequestId);
    // Queue for manual reconciliation, mirroring the C2B unmatched-payment path
    await prisma.mpesaReconciliationQueue
      .create({
        data: {
          schoolId,
          mpesaTransactionId: mpesaReceiptNumber,
          rawAccountNumber:   rawPhone,
          amount:             new Decimal(rawAmount),
          paidAt:             new Date(),
          rawPayload:         payload as object,
          suggestedStudentId: null,
          status:             "PENDING",
        },
      })
      .catch(() => {});
    return OK;
  }

  const studentId = stkRequest.studentId;

  // 7. Look up a real user for the postedById FK (system/auto-post)
  const systemUser = await prisma.user.findFirst({
    where:   { schoolId, isActive: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select:  { id: true },
  });

  if (!systemUser) {
    console.error("[STK-CALLBACK] No active user found for schoolId:", schoolId);
    return OK;
  }

  const amount = new Decimal(rawAmount);

  // 8. Post Payment + LedgerEntry + FinanceNotification in a single transaction
  let paymentId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL "app.current_school_id" = '${schoolId.replace(/[^a-zA-Z0-9_\-]/g, "")}'`
      );

      const receiptNumber = await nextReceiptNumber(tx, schoolId, receiptPrefix);

      const payment = await tx.payment.create({
        data: {
          schoolId,
          studentId,
          termId:               null,
          amount,
          method:               "MPESA",
          mpesaTransactionId:   mpesaReceiptNumber,
          mpesaRawPayload:      payload as object,
          receiptNumber,
          paidAt:               new Date(),
          postedById:           systemUser.id,
          reconciliationStatus: "AUTO_MATCHED",
          reference:            checkoutRequestId,
        },
        select: { id: true },
      });

      paymentId = payment.id;

      await postLedgerEntry(tx, {
        schoolId,
        studentId,
        entryType:          "PAYMENT",
        amount,
        description:        `M-Pesa STK Push ${mpesaReceiptNumber}`,
        referenceId:        mpesaReceiptNumber,
        referenceType:      "PAYMENT",
        paymentMethod:      "MPESA",
        mpesaTransactionId: mpesaReceiptNumber,
        postedById:         systemUser.id,
      });

      await tx.financeNotification.create({
        data: {
          schoolId,
          studentId,
          type:    "PAYMENT_RECEIVED",
          message: `M-Pesa STK Push ${mpesaReceiptNumber} auto-credited — KES ${amount.toFixed(2)}`,
        },
      });

      // Mark the StkPushRequest as completed
      await tx.stkPushRequest.update({
        where: { id: stkRequest.id },
        data:  {
          status:             "COMPLETED",
          mpesaReceiptNumber,
          completedAt:        new Date(),
        },
      });
    });
  } catch (err) {
    console.error("[STK-CALLBACK] Transaction failed:", err);
    // Don't return an error code — Daraja should not retry (it already fired)
    return OK;
  }

  // 9. Parent notification — fire-and-forget outside the transaction
  if (paymentId) {
    void notifyParents({
      schoolId,
      studentId,
      module:   "FEES",
      priority: "LOW",
      title:    "Payment Received",
      body:     `KSh ${amount.toFixed(2)} received via M-Pesa. Thank you!`,
      dedupKey: `stk-payment-${paymentId}`,
    }).catch(() => {});
  }

  return OK;
}
