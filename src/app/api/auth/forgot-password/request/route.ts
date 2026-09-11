/**
 * POST /api/auth/forgot-password/request
 *
 * Step 1 of the forgot-password OTP flow.
 *
 * • Resolves the identifier to a User (same logic as login).
 * • Looks up the user's phone number (Teacher.phone or Parent.phone).
 * • Rate-limits: max 3 requests per 15 min per identifier (fail-closed).
 * • Generates a 6-digit OTP, bcrypt-hashes it, stores in PasswordResetOtp.
 * • Sends via dispatchPlatformSms — NOT deducted from the school wallet.
 * • Always returns the same generic success response to prevent enumeration.
 */

import { NextRequest, NextResponse }            from "next/server";
import { z }                                    from "zod";
import bcrypt                                   from "bcryptjs";
import { prisma }                               from "@/lib/prisma";
import { resolveUserByIdentifier, resolveUserPhone } from "@/lib/identity";
import { checkOtpRequestRateLimit }             from "@/lib/rateLimit";
import { dispatchPlatformSms }                  from "@/lib/messaging/dispatch";

const schema = z.object({
  identifier: z.string().trim().min(1),
  schoolSlug: z.string().trim().optional().or(z.literal("")),
});

// Generic response — returned regardless of outcome to prevent enumeration
const GENERIC_OK = NextResponse.json(
  { message: "If an account matches, a code has been sent." },
  { status: 200 }
);

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return GENERIC_OK; // never reveal parse errors

  const { identifier, schoolSlug } = parsed.data;

  // ── Rate limit (fail-closed) ──────────────────────────────────────────────
  const rl = await checkOtpRequestRateLimit(identifier);
  if (!rl.allowed) {
    if (rl.reason === "redis_unavailable") {
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    // Rate-limited — return generic to avoid timing oracle
    return GENERIC_OK;
  }

  // ── Resolve user ──────────────────────────────────────────────────────────
  const result = await resolveUserByIdentifier(
    identifier,
    schoolSlug || undefined
  );

  // Any non-found outcome: return generic (never reveal account existence)
  if (result.kind !== "found") return GENERIC_OK;

  const { user } = result;

  // ── Resolve phone ─────────────────────────────────────────────────────────
  const phone = await resolveUserPhone(user.id, user.role);
  if (!phone) return GENERIC_OK; // no phone on file — generic response

  // ── Generate + store OTP ──────────────────────────────────────────────────
  const otp       = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const otpHash   = await bcrypt.hash(otp, 12);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.passwordResetOtp.create({
    data: { userId: user.id, phone, otpHash, expiresAt },
  });

  // ── Send via platform SMS (never wallet-deducted) ─────────────────────────
  await dispatchPlatformSms(
    phone,
    `Your Bidii password reset code is ${otp}. It expires in 10 minutes. ` +
    `If you didn't request this, ignore this message.`
  );

  return GENERIC_OK;
}
