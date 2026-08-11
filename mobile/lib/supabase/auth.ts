/**
 * mobile/lib/supabase/auth.ts
 *
 * OTP request/verify wrappers for the mobile app — mirrors the logic in
 * src/lib/supabase/auth.ts on the web so both platforms use identical calls.
 */

import { supabase } from "./client";

export type OtpError = {
  message: string;
  status?: number;
};

/** Step 1 — Send a 6-digit OTP to the given email. */
export async function requestOtp(email: string): Promise<OtpError | null> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) return { message: error.message, status: error.status };
  return null;
}

/** Step 2 — Verify the 6-digit code. */
export async function verifyOtp(
  email: string,
  token: string
): Promise<OtpError | null> {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) return { message: error.message, status: error.status };
  return null;
}

/** Loosely validates an email address. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Validates that a token is exactly 6 digits. */
export function isValidOtpToken(token: string): boolean {
  return /^\d{6}$/.test(token.trim());
}

/** Maps Supabase error messages to user-friendly strings. */
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
