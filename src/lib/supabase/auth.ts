/**
 * src/lib/supabase/auth.ts
 *
 * Thin wrappers around Supabase Auth OTP calls. Used by both the web API
 * routes and (with the same logic duplicated) the mobile app so the actual
 * Supabase calls are consistent.
 *
 * Design notes:
 * ─────────────
 * • We use Supabase Auth purely as an OTP delivery + verification service.
 *   We do NOT store application users in auth.users — we keep our own
 *   `User` table in Postgres so we can have per-school email uniqueness
 *   (the same email can belong to users at different schools, which is
 *   impossible in Supabase's globally-unique auth.users).
 *
 * • The flow is:
 *     1. requestOtp(email)  — calls signInWithOtp; Supabase sends the code.
 *     2. verifyOtp(email, token) — calls verifyOtp; on success we look up
 *        the matching User row(s) in our DB by email and create our own
 *        cookie-based session (same pattern as before).
 *
 * • We use the browser client for requestOtp/verifyOtp (called from API
 *   routes that run on the server but use the anon key for auth ops).
 */

import { createClient } from "@supabase/supabase-js";

// Lightweight anon client for auth operations only (no cookie plumbing needed).
function getAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export type OtpError = {
  message: string;
  status?: number;
};

/**
 * Step 1 — Send a 6-digit OTP to the given email via Supabase Auth.
 * Returns null on success, or an OtpError on failure.
 */
export async function requestOtp(email: string): Promise<OtpError | null> {
  const supabase = getAuthClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Do not create a Supabase auth.users row automatically —
      // we manage our own user table. Setting shouldCreateUser: false
      // means Supabase will only send the OTP if the email was previously
      // used with signInWithOtp; since we handle user lookup ourselves
      // via our Postgres User table we set it to true so any registered
      // school email can request a code.
      shouldCreateUser: true,
    },
  });
  if (error) return { message: error.message, status: error.status };
  return null;
}

/**
 * Step 2 — Verify the 6-digit OTP the user entered.
 * Returns null on success, or an OtpError on failure.
 * The caller is responsible for creating the app session after this succeeds.
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

// ── Shared validation helpers (used on web and can be copied to mobile) ─────

/** Loosely validates an email address. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Validates that a token is exactly 6 digits. */
export function isValidOtpToken(token: string): boolean {
  return /^\d{6}$/.test(token.trim());
}

/**
 * Maps Supabase Auth error messages to user-friendly strings.
 * Keeps the UI decoupled from Supabase's internal error vocabulary.
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
