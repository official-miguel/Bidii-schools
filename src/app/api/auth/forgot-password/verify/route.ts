/**
 * POST /api/auth/forgot-password/verify
 *
 * Step 2 of the forgot-password OTP flow.
 *
 * • Resolves identifier → User (same shared helper as the request step).
 * • Loads the most recent PasswordResetOtp for that user.
 * • Validates: not expired, not already used, attempts < 5.
 * • Compares OTP via bcrypt (increments attempts on failure).
 * • On success:
 *     1. Marks OTP as verified (verifiedAt = now).
 *     2. Sets User.mustChangePassword = true.
 *     3. Revokes ALL existing sessions for the user.
 *     4. Creates a fresh session (same helpers as login/route.ts).
 *     5. Sets the session cookie.
 *     6. Returns { ok: true, redirectTo: <role-dashboard-path> }.
 *
 * No new password is set here — the existing ForcePasswordChangeModal +
 * /api/auth/change-password handle that, unchanged.
 */

import { NextRequest, NextResponse }              from "next/server";
import { z }                                      from "zod";
import bcrypt                                     from "bcryptjs";
import { prisma }                                 from "@/lib/prisma";
import { resolveUserByIdentifier }                from "@/lib/identity";
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";
import { cookies }                                from "next/headers";

const schema = z.object({
  identifier: z.string().trim().min(1),
  schoolSlug: z.string().trim().optional().or(z.literal("")),
  otp:        z.string().trim().length(6),
});

function rolePath(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":  return "/super-admin";
    case "PRINCIPAL":    return "/principal";
    case "TEACHER":      return "/teacher";
    case "ADMIN_STAFF":  return "/staff";
    case "BURSAR":       return "/staff";
    case "PARENT":       return "/parent";
    default:             return "/login?notice=dashboard-not-ready";
  }
}

const INVALID = () =>
  NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { identifier, schoolSlug, otp } = parsed.data;

  // ── Resolve user ──────────────────────────────────────────────────────────
  const result = await resolveUserByIdentifier(
    identifier,
    schoolSlug || undefined
  );

  if (result.kind === "db_error") {
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }
  if (result.kind !== "found") return INVALID();

  const { user } = result;

  // ── Load most recent OTP row ──────────────────────────────────────────────
  const otpRow = await prisma.passwordResetOtp.findFirst({
    where:   { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRow)                          return INVALID();
  if (otpRow.verifiedAt !== null)       return INVALID(); // already used
  if (otpRow.expiresAt  < new Date())   return INVALID(); // expired
  if (otpRow.attempts   >= 5)           return INVALID(); // brute-force lockout

  // ── Compare OTP ───────────────────────────────────────────────────────────
  const match = await bcrypt.compare(otp, otpRow.otpHash).catch(() => false);

  if (!match) {
    // Increment attempts before returning so lockout works
    await prisma.passwordResetOtp.update({
      where: { id: otpRow.id },
      data:  { attempts: { increment: 1 } },
    });
    return INVALID();
  }

  // ── Success path ──────────────────────────────────────────────────────────

  // 1. Mark OTP as used
  await prisma.passwordResetOtp.update({
    where: { id: otpRow.id },
    data:  { verifiedAt: new Date() },
  });

  // 2. Set mustChangePassword so ForcePasswordChangeModal appears immediately
  await prisma.user.update({
    where: { id: user.id },
    data:  { mustChangePassword: true },
  });

  // 3. Revoke all existing sessions (no prior session survives a password reset)
  await prisma.session.deleteMany({ where: { userId: user.id } });

  // 4. Create a fresh forced-change session
  const token = await createSession(user.id);

  // 5. Set session cookie (same shape as login/route.ts and change-password/route.ts)
  const redirectTo = rolePath(user.role);
  const res = NextResponse.json({ ok: true, redirectTo });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   Math.floor(SESSION_TTL_MS / 1000),
  });

  return res;
}
