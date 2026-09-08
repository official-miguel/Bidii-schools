/**
 * POST /api/parent/fees/stk-push
 *
 * Initiates a Safaricom Daraja STK Push (Lipa na M-Pesa Online) on behalf of
 * an authenticated parent. The parent supplies only an amount; the phone
 * number is taken from parent.phone (their registered Safaricom number) and
 * the AccountReference is the student's admission number so the C2B callback
 * auto-reconciles without any extra input from the parent.
 *
 * Flow:
 *  1. Auth guard — requireParent()
 *  2. Rate limit — shared parent rate limiter
 *  3. Ownership check — ownsStudent(parent, studentId)
 *  4. Input validation — amount (whole KES, 1–150,000)
 *  5. Fetch student admissionNumber + parent.phone
 *  6. Fetch Daraja credentials — MPESA_DARAJA SchoolIntegration row
 *     metadata: { shortcode, passkey, env?: "sandbox"|"production" }
 *     encryptedValue: consumer_key + ":" + consumer_secret (AES-256-GCM)
 *  7. Obtain OAuth access token from Daraja
 *  8. POST to Daraja STK Push with:
 *       PartyA / PhoneNumber = parent.phone (E.164)
 *       PartyB               = school paybill shortcode
 *       AccountReference     = student admissionNumber
 *  9. Persist a pending StkPushRequest row for callback reconciliation
 * 10. Return { checkoutRequestId, merchantRequestId } to the client
 *
 * Callback URL:
 *   {NEXT_PUBLIC_APP_URL}/api/finance/stk-callback/{school.stkCallbackToken}
 *
 * Requirements: 7.4
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getSchoolIntegrationKey } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Input schema — only amount; phone comes from the authenticated parent record
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  studentId: z.string().trim().min(1, "studentId is required."),
  amount: z
    .number({ required_error: "Amount is required." })
    .int("Amount must be a whole number of KES.")
    .min(1, "Amount must be at least KES 1.")
    .max(150_000, "Amount cannot exceed KES 150,000 per transaction."),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise any 07xx / 01xx / +254xx format to 2547xxxxxxxx (no leading +) */
function toE164Kenya(phone: string): string {
  const s = phone.replace(/\s+/g, "");
  if (s.startsWith("+254")) return s.slice(1);
  if (s.startsWith("254"))  return s;
  if (s.startsWith("0"))    return "254" + s.slice(1);
  return s;
}

/** Timestamp in YYYYMMDDHHmmss format — Daraja requirement */
function darajaTimestamp(): string {
  const n = new Date();
  return (
    n.getFullYear().toString() +
    String(n.getMonth() + 1).padStart(2, "0") +
    String(n.getDate()).padStart(2, "0") +
    String(n.getHours()).padStart(2, "0") +
    String(n.getMinutes()).padStart(2, "0") +
    String(n.getSeconds()).padStart(2, "0")
  );
}

/** Daraja password = base64(shortcode + passkey + timestamp) */
function darajaPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(shortcode + passkey + timestamp).toString("base64");
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Auth
  const parent = await requireParent();
  if (!parent) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Rate limit
  if (!(await checkRateLimit(parent.userId))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // 3. Parse + validate body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { studentId, amount } = parsed.data;

  // 4. Ownership check
  if (!ownsStudent(parent, studentId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // 5. Fetch student admissionNumber (AccountReference) + parent phone
  const [student, parentRecord] = await Promise.all([
    prisma.student.findFirst({
      where:  { id: studentId, schoolId: parent.schoolId, archivedAt: null },
      select: { admissionNumber: true, fullName: true },
    }),
    // Re-query to get the phone field — requireParent() doesn't load it
    prisma.parent.findUnique({
      where:  { id: parent.id },
      select: { phone: true },
    }),
  ]);

  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  if (!parentRecord?.phone) {
    return NextResponse.json(
      { error: "No phone number on your account. Please contact the school administrator." },
      { status: 422 }
    );
  }

  const e164Phone = toE164Kenya(parentRecord.phone);

  // 6. Fetch Daraja credentials for this school
  const integration = await getSchoolIntegrationKey(parent.schoolId, "MPESA_DARAJA");
  if (!integration) {
    return NextResponse.json(
      { error: "M-Pesa is not configured for this school. Please contact the school administrator." },
      { status: 503 }
    );
  }

  // encryptedValue stores "consumerKey:consumerSecret"
  const [consumerKey, consumerSecret] = integration.apiKey.split(":");
  if (!consumerKey || !consumerSecret) {
    return NextResponse.json(
      { error: "M-Pesa credentials are incomplete. Please contact the school administrator." },
      { status: 503 }
    );
  }

  const meta      = (integration.metadata ?? {}) as Record<string, string>;
  const shortcode = meta.shortcode;
  const passkey   = meta.passkey;
  const env       = (meta.env ?? "production") as "sandbox" | "production";

  if (!shortcode || !passkey) {
    return NextResponse.json(
      { error: "M-Pesa shortcode/passkey not configured. Please contact the school administrator." },
      { status: 503 }
    );
  }

  // 7. Fetch the school's STK callback token
  const school = await prisma.school.findUnique({
    where:  { id: parent.schoolId },
    select: { stkCallbackToken: true },
  });
  if (!school?.stkCallbackToken) {
    return NextResponse.json(
      { error: "Payment callback not configured. Please contact the school administrator." },
      { status: 503 }
    );
  }

  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const callbackUrl = `${appUrl}/api/finance/stk-callback/${school.stkCallbackToken}`;

  // 8. Daraja OAuth token
  const darajaBase =
    env === "sandbox"
      ? "https://sandbox.safaricom.co.ke"
      : "https://api.safaricom.co.ke";

  let accessToken: string;
  try {
    const tokenRes = await fetch(
      `${darajaBase}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method:  "GET",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64"),
        },
      }
    );
    if (!tokenRes.ok) {
      console.error("[STK-PUSH] OAuth failed", tokenRes.status, await tokenRes.text());
      return NextResponse.json(
        { error: "Could not connect to M-Pesa. Please try again shortly." },
        { status: 502 }
      );
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    accessToken = tokenData.access_token ?? "";
    if (!accessToken) throw new Error("empty access_token");
  } catch (err) {
    console.error("[STK-PUSH] OAuth error:", err);
    return NextResponse.json(
      { error: "Could not connect to M-Pesa. Please try again shortly." },
      { status: 502 }
    );
  }

  // 9. Initiate STK Push
  //    PartyA / PhoneNumber = parent's registered phone (E.164, no +)
  //    PartyB               = school paybill shortcode
  //    AccountReference     = student admission number (auto-reconciles with C2B)
  const timestamp = darajaTimestamp();
  const password  = darajaPassword(shortcode, passkey, timestamp);

  let stkData: Record<string, unknown>;
  try {
    const stkRes = await fetch(`${darajaBase}/mpesa/stkpush/v1/processrequest`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   "CustomerPayBillOnline",
        Amount:            amount,
        PartyA:            e164Phone,
        PartyB:            shortcode,
        PhoneNumber:       e164Phone,
        CallBackURL:       callbackUrl,
        AccountReference:  student.admissionNumber,
        TransactionDesc:   `Fees — ${student.admissionNumber}`,
      }),
    });

    stkData = (await stkRes.json()) as Record<string, unknown>;

    if (!stkRes.ok || String(stkData.ResponseCode) !== "0") {
      const desc = String(
        stkData.ResponseDescription ?? stkData.errorMessage ?? "STK Push failed."
      );
      console.error("[STK-PUSH] Daraja error:", stkData);
      return NextResponse.json({ error: desc }, { status: 502 });
    }
  } catch (err) {
    console.error("[STK-PUSH] STK request error:", err);
    return NextResponse.json(
      { error: "M-Pesa request failed. Please try again." },
      { status: 502 }
    );
  }

  const checkoutRequestId = String(stkData.CheckoutRequestID ?? "");
  const merchantRequestId = String(stkData.MerchantRequestID ?? "");

  // 10. Persist the pending request for callback reconciliation
  await prisma.stkPushRequest
    .create({
      data: {
        schoolId:          parent.schoolId,
        studentId,
        parentId:          parent.id,
        checkoutRequestId,
        merchantRequestId,
        amount,
        phone:             e164Phone,
        status:            "PENDING",
      },
    })
    .catch((err: unknown) => {
      // Non-fatal — callback reconciles via StkPushRequest or falls back to queue
      console.error("[STK-PUSH] Failed to persist StkPushRequest:", err);
    });

  return NextResponse.json({ checkoutRequestId, merchantRequestId }, { status: 202 });
}
