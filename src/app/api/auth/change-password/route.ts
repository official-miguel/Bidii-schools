/**
 * POST /api/auth/change-password
 *
 * First-login mandatory password change.
 * Validates the current (temporary) password, hashes the new one,
 * clears mustChangePassword, and rotates the session so any other
 * tabs pick up the change immediately.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  hashPassword,
  createSession,
  destroySession,
  SESSION_COOKIE,
  getCurrentUser,
} from "@/lib/auth";
import { cookies } from "next/headers";

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
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

  const { currentPassword, newPassword } = parsed.data;

  // Verify the current (temporary) password
  // passwordHash may be null for OTP-only accounts — they cannot use this route.
  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "Your account uses one-time code login and has no password to change." },
      { status: 400 }
    );
  }
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 400 }
    );
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "New password must be different from your current password." },
      { status: 400 }
    );
  }

  const newHash = await hashPassword(newPassword);

  // Update password and clear the force-change flag
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  // Rotate session — destroy the old cookie, issue a fresh one
  const oldToken = cookies().get(SESSION_COOKIE)?.value;
  if (oldToken) {
    await destroySession(oldToken).catch(() => {});
  }
  const newToken = await createSession(user.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
