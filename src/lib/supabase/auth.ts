/**
 * src/lib/supabase/auth.ts
 *
 * Thin wrappers around Supabase Auth OTP calls.
 *
 * Design:
 * ───────
 * • Supabase Auth is used ONLY as an OTP delivery + verification service.
 *   We do NOT rely on auth.users for application identity — we keep our own
 *   `User` table in Postgres so per-school email uniqueness is preserved
 *   (same email at two schools = two User rows, impossible in auth.users).
 *
 * • shouldCreateUser: false — we never want Supabase to create auth.users
 *   rows for our app users. OTPs are verified against whatever email the
 *   user enters; our DB lookup happens after verification succeeds.
 *   NOTE: This means Supabase will return an error for the *first* OTP
 *   request if the email has never been seen before. We handle this gracefully
 *   in requestOtp by treating that error as success — Supabase still sends
 *   the code even when shouldCreateUser is false for known emails. For
 *   completely new emails (unregistered), the code is never sent; our
 *   /api/auth/otp/request route guards against this by checking our DB first.
 *
 * • Flow:
 *     1. /api/auth/otp/request  → count User rows by email → if > 0, call requestOtp
 *     2. User enters 6-digit code
 *     3. /api/auth/otp/verify   → verifyOtp → look up User → create bidii_session
 */

import { createClient } from "@supabase/supabase-js";

function getAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export type OtpError = { message: string; status?: number };

/**
 * Step 1 — Ask Supabase Auth to send a 6-digit OTP to the email.
 * shouldCreateUser: false — we manage our own user table.
 */
export async function requestOtp(email: string): Promise<OtpError | null> {
  const supabase = getAuthClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) return { message: error.message, status: error.status };
  return null;
}

/**
 * Step 2 — Verify the 6-digit code the user entered.
 * Returns null on success, OtpError on failure.
 */
export async function verifyOtp(
  email: string,
  token: string
): Promise<OtpError | null> {
  const supabase = getAuthClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) return { message: error.message, status: error.status };
  return null;
}

// ── Validation helpers ────────────────────────────────────────────────────────

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidOtpToken(token: string): boolean {
  return /^\d{6}$/.test(token.trim());
}

/**
 * Maps Supabase Auth error messages → user-friendly strings.
 */
export function mapOtpError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("invalid") || m.includes("expired") || m.includes("not found"))
    return "That code is invalid or has expired. Please request a new one.";
  if (m.includes("email"))
    return "There was a problem sending the email. Please try again.";
  return "Something went wrong. Please try again.";
}
