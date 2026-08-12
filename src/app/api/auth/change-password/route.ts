/**
 * POST /api/auth/change-password
 *
 * First-login mandatory password change.
 *
 * Flow:
 *   • Teacher logs in for the first time using the school slug as their password.
 *   • mustChangePassword === true, so the ForcePasswordChangeModal is shown.
 *   • The modal submits ONLY { newPassword, confirmPassword } — no "current password"
 *     field is needed because the user already proved identity at login.
 *   • This route hashes and saves the new password, clears mustChangePassword,
 *     and rotates the session.
 *
 * Guard: the new password CANNOT equal the school's slug (with or without a
 * leading "@").  This ensures the initial shared password is permanently retired.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  createSession,
  destroySession,
  SESSION_COOKIE,
  getCurrentUser,
} from "@/lib/auth";
import { cookies } from "next/headers";

const schema = z.object({
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .regex(/[A-Z]/, "Include at least one uppercase letter.")
    .regex(/[0-9]/, "Include at least one number."),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { newPassword } = parsed.data;

  // ── Guard: new password cannot be the school's slug ─────────────────────
  const school = await prisma.school.findUnique({
    where:  { id: user.schoolId },
    select: { slug: true },
  });

  if (school) {
    const normNew  = newPassword.replace(/^@/, "").toLowerCase();
    const normSlug = school.slug.replace(/^@/, "").toLowerCase();
    if (normNew === normSlug) {
      return NextResponse.json(
        {
          error:
            "You cannot use the school identifier as your password. " +
            "Please choose a personal password.",
        },
        { status: 400 }
      );
    }
  }

  const newHash = await hashPassword(newPassword);

  // Save new password and clear the force-change flag
  await prisma.user.update({
    where: { id: user.id },
    data:  { passwordHash: newHash, mustChangePassword: false },
  });

  // Rotate session — destroy old cookie, issue a fresh one
  const oldToken = cookies().get(SESSION_COOKIE)?.value;
  if (oldToken) {
    await destroySession(oldToken).catch(() => {});
  }
  const newToken = await createSession(user.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 24 * 7,
  });
  return res;
}
