/**
 * POST /api/auth/otp/verify
 *
 * Step 2 of the OTP login flow. Verifies the 6-digit code with Supabase Auth,
 * then looks up the matching User row in our Postgres DB by email. Creates our
 * own session cookie (same pattern as before) so the rest of the app is
 * unchanged.
 *
 * Per-school email model:
 *   If the email matches users at exactly one school → log in directly.
 *   If it matches users at multiple schools → return requiresSchoolSlug=true
 *   so the client shows the school identifier field, then the user re-submits
 *   with schoolSlug included.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyOtp, isValidEmail, isValidOtpToken, mapOtpError } from "@/lib/supabase/auth";
import { createSession, SESSION_COOKIE, buildOfflineToken } from "@/lib/auth";

const schema = z.object({
  email:      z.string().email().toLowerCase().trim(),
  token:      z.string().min(6).max(6),
  schoolSlug: z.string().trim().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and 6-digit code." }, { status: 400 });
  }

  const { email, token, schoolSlug } = parsed.data;

  if (!isValidEmail(email) || !isValidOtpToken(token)) {
    return NextResponse.json({ error: "Enter a valid email and 6-digit code." }, { status: 400 });
  }

  // ── 1. Verify the OTP with Supabase Auth ────────────────────────────────
  const otpErr = await verifyOtp(email, token);
  if (otpErr) {
    return NextResponse.json(
      { error: mapOtpError(otpErr.message) },
      { status: otpErr.status === 429 ? 429 : 401 }
    );
  }

  // ── 2. Find the matching User row(s) in our DB ───────────────────────────
  let user: Awaited<ReturnType<typeof prisma.user.findFirst>>;

  if (schoolSlug) {
    // Caller already told us which school — direct lookup.
    const school = await prisma.school.findUnique({
      where: { slug: schoolSlug },
      select: { id: true },
    }).catch(() => null);

    if (!school) {
      return NextResponse.json(
        { error: "School identifier not found. Please check and try again." },
        { status: 404 }
      );
    }

    user = await prisma.user.findFirst({
      where: { email, schoolId: school.id, isActive: true },
    }).catch(() => null);
  } else {
    // No slug — find all active accounts for this email.
    const candidates = await prisma.user.findMany({
      where: { email, isActive: true },
    }).catch(() => []);

    if (candidates.length === 0) {
      // OTP verified but email has no registered account — shouldn't happen
      // in normal flow (request step guards against this), but handle it.
      return NextResponse.json(
        { error: "No account found for this email." },
        { status: 404 }
      );
    }

    if (candidates.length === 1) {
      user = candidates[0];
    } else {
      // Multiple schools share this email — ask the client to disambiguate.
      return NextResponse.json(
        {
          error:              "Your account is linked to more than one school. Please enter your school identifier to continue.",
          requiresSchoolSlug: true,
        },
        { status: 409 }
      );
    }
  }

  if (!user || !user.isActive) {
    return NextResponse.json(
      { error: "Account not found or is inactive. Contact your administrator." },
      { status: 401 }
    );
  }

  // ── 3. Create our own session cookie (unchanged from password flow) ──────
  const sessionToken  = await createSession(user.id);
  const offlineToken  = buildOfflineToken(user);

  const res = NextResponse.json({
    role:               user.role,
    mustChangePassword: user.mustChangePassword,
    offlineToken,
  });

  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 24 * 7, // 7 days
  });

  return res;
}
