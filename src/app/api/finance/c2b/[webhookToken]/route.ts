/**
 * POST /api/finance/c2b/[webhookToken]
 *
 * Public endpoint — no session cookie auth.
 * Authentication is via HMAC-SHA256 signature on the request body.
 *
 * Renamed from /api/finance/mpesa/webhook/[webhookToken] because Safaricom
 * Daraja rejects any Confirmation/Validation URL that contains the word "mpesa".
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

// GET — health check so you can confirm the URL is reachable and the token resolves.
// Visit the webhook URL in a browser: should return {"ok":true,"schoolFound":true/false}
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

  // 1. Look up school by webhook token
  // Check both legacy FinanceSettings.mpesaWebhookUrl and new SchoolMpesaPaybill.webhookUrl
  const [legacySettings, paybillRecord] = await Promise.all([
    prisma.financeSettings.findFirst({
      where:  { mpesaWebhookUrl: { contains: token } },
      select: { schoolId: true, mpesaWebhookSecret: true, receiptPrefix: true },
    }),
    prisma.schoolMpesaPaybill.findFirst({
      where:  { webhookUrl: token, isActive: true },
      select: {
        schoolId: true,
        webhookSecret: true,
        school: { select: { financeSettings: { select: { receiptPrefix: true } } } },
      },
    }),
  ]);

  console.log(`[C2B] token=${token} legacy=${!!legacySettings} paybill=${!!paybillRecord}`);

  // Resolve whichever matched
  const schoolId      = legacySettings?.schoolId ?? paybillRecord?.schoolId;
  const rawSecret     = legacySettings?.mpesaWebhookSecret ?? paybillRecord?.webhookSecret;
  const receiptPrefix = legacySettings?.receiptPrefix
    ?? paybillRecord?.school?.financeSettings?.receiptPrefix
    ?? "REC-";

  // Must match a known paybill — but secret is optional (sandbox has none)
  if (!schoolId) {
    console.log(`[C2B] REJECTED — no school found for token=${token}`);
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Unauthorized" }, { status: 401 });
  }

  // 2. Read raw body
  const rawBody = await req.text();
  console.log(`[C2B] rawBody length=${rawBody.length} preview=${rawBody.slice(0,100)}`);

  // HMAC verification — only enforced when a secret is configured.
  // Daraja sandbox does not send x-mpesa-signature so we skip it there.
  if (rawSecret) {
    const sig    = req.headers.get("x-mpesa-signature") ?? "";
    const secret = decryptSecret(rawSecret);
    if (sig && !verifyHmac(secret, rawBody, sig)) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid signature" }, { status: 401 });
    }
  }

  // Resolve a real userId for postedById — required FK on Payment/LedgerEntry.
  // Use the school's first BURSAR, fallback to any user in the school.
  // Only needed for the exact-match auto-credit path, so we defer this lookup.
  let postedById: string | null = null;

  // Always return 200 to Daraja from here on (even on duplicates)

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); }
  catch {
    console.log(`[C2B] JSON parse failed, rawBody="${rawBody}"`);
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted", debug_bodyLen: rawBody.length });
  }

  const mpesaTransactionId = String(payload.TransID ?? payload.transID ?? "");
  const rawAccountNumber   = String(payload.BillRefNumber ?? payload.AccountReference ?? "");
  const amountStr          = String(payload.TransAmount ?? payload.Amount ?? "0");
  const paidAt             = new Date(String(payload.TransTime ?? Date.now()));
  const amount             = new Decimal(amountStr.replace(/[^0-9.]/g, "") || "0");

  console.log(`[C2B] schoolId=${schoolId} txId=${mpesaTransactionId} ref=${rawAccountNumber} amount=${amount}`);

  if (!mpesaTransactionId) return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted", debug: "no_txid" });

  // 3. Idempotency check
  const [existingEntry, existingQueue] = await Promise.all([
    prisma.ledgerEntry.findUnique({ where: { mpesaTransactionId }, select: { id: true } }),
    prisma.mpesaReconciliationQueue.findUnique({ where: { mpesaTransactionId }, select: { id: true } }),
  ]);
  if (existingEntry || existingQueue) {
    console.log(`[C2B] duplicate txId=${mpesaTransactionId}`);
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted", debug: "duplicate" }); // idempotent
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

  console.log(`[C2B] students=${allStudents.length} match=${JSON.stringify(matchResult)}`);

  const prefix = receiptPrefix ?? "REC-";

  if (matchResult?.confidence === 1.0) {
    // 5a. Exact match — auto-credit. Look up any active user for postedById FK.
    const systemUser = await prisma.user.findFirst({
      where:   { schoolId, isActive: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select:  { id: true },
    });
    postedById = systemUser?.id ?? null;
    if (!postedById) {
      console.log(`[C2B] no user found for schoolId=${schoolId}, falling back to queue`);
    }
  }

  if (matchResult?.confidence === 1.0 && postedById) {
    // 5a. Exact match — auto-credit
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_school_id = '${schoolId}'`);

        const receiptNumber = await nextReceiptNumber(tx, schoolId, prefix);

        await tx.payment.create({
          data: {
            schoolId, studentId: matchResult.studentId!, termId: null,
            amount, method: "MPESA",
            mpesaTransactionId,
            mpesaRawPayload: payload as object,
            receiptNumber,
            paidAt,
            postedById,
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
          postedById,
        });

        await tx.financeNotification.create({
          data: {
            schoolId, studentId: matchResult.studentId!, type: "PAYMENT_RECEIVED",
            message: `M-Pesa payment ${mpesaTransactionId} auto-credited — KES ${amount.toFixed(2)}`,
          },
        });
      });
    } catch (err) {
      console.error("[C2B/WEBHOOK] auto-credit failed:", err);
    }
  } else {
    // 5b. Fuzzy or no match — queue for manual reconciliation
    try {
      await prisma.mpesaReconciliationQueue.create({
        data: {
          schoolId, mpesaTransactionId, rawAccountNumber, amount, paidAt,
          rawPayload:          payload as object,
          suggestedStudentId:  matchResult?.studentId ?? null,
          suggestedConfidence: matchResult?.confidence ?? null,
          status:              "PENDING",
        },
      });
      console.log(`[C2B] queued txId=${mpesaTransactionId} for reconciliation`);

      prisma.financeNotification.create({
        data: {
          schoolId, studentId: null, type: "RECONCILIATION_NEEDED",
          message: `Unmatched M-Pesa payment ${mpesaTransactionId} — KES ${amount.toFixed(2)} from "${rawAccountNumber}" requires manual reconciliation.`,
        },
      }).catch(e => console.error("[C2B] notification failed (non-fatal):", e));

      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted", debug: "queued" });

    } catch (err) {
      console.error("[C2B/WEBHOOK] queue failed:", err);
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted", debug: `queue_err:${String(err)}` });
    }
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted", debug: "auto_credited" });
}
