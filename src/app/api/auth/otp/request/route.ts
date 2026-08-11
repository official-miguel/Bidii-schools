/**
 * POST /api/auth/otp/request
 *
 * Step 1 of the OTP login flow. Validates that the email belongs to at least
 * one active user in the system, then asks Supabase Auth to send a 6-digit
 * code. Returns 200 on success regardless of whether the email exists —
 * this prevents email enumeration.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requestOtp, isValidEmail } from "@/lib/supabase/auth";

const schema = z.object({
  email: z.string().email("Enter a valid email address.").toLowerCase().trim(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success || !isValidEmail(parsed.data.email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { email } = parsed.data;

  // Verify the email belongs to at least one active user in our system.
  // We do this before calling Supabase so we don't send OTPs to addresses
  // that have never been registered — reduces noise and prevents spam abuse.
  // Use count (not findFirst) to avoid leaking user data into this route.
  const count = await prisma.user.count({
    where: { email, isActive: true },
  }).catch(() => 0);

  // If no match: still return 200 so the response is indistinguishable from
  // a successful send. The user will simply never receive a code.
  if (count === 0) {
    return NextResponse.json({ ok: true });
  }

  // Ask Supabase Auth to send the OTP.
  const err = await requestOtp(email);
  if (err) {
    // Only surface rate-limit errors to the client; all others are generic.
    const isRateLimit =
      err.message.toLowerCase().includes("rate limit") ||
      err.message.toLowerCase().includes("too many");
    return NextResponse.json(
      { error: isRateLimit
          ? "Too many requests. Please wait a minute and try again."
          : "Couldn't send the code. Please try again." },
      { status: isRateLimit ? 429 : 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
