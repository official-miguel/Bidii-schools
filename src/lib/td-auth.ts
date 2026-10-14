/**
 * Shared login with the Trillionaire Designs finance app.
 *
 * Who is a super admin is decided here, in Bidii, as before. Their password
 * is kept by the Trillionaire Designs app (its Supabase Auth), so they have
 * one password for both. When TD_SUPABASE_URL and TD_SUPABASE_ANON_KEY are set:
 *
 *   • verifyWithTd() — the super-admin login checks the typed password there,
 *     and accepts it only for an active person in that app.
 *   • verifyTdToken(..., "bidii-super-admin") — the "Bidii super admin" button
 *     in that app sends a signed one-time pass (HS256, TD_SSO_SECRET, about a
 *     minute long) so the person lands here already signed in.
 *   • verifyTdToken(..., "bidii-account-check") — that app asks whether an
 *     email has an active super admin account here, so it shows the button
 *     only to people who do.
 *   • verifyTdToken(..., "bidii-password-check") — the first time a super
 *     admin signs in to that app, it checks their Bidii password here, so
 *     they keep the password they already have.
 *
 * When the variables are not set, nothing changes: super admins sign in with
 * the password stored here, exactly as before.
 */

import { createHmac, timingSafeEqual } from "crypto";

const TD_URL  = () => process.env.TD_SUPABASE_URL?.replace(/\/$/, "");
const TD_ANON = () => process.env.TD_SUPABASE_ANON_KEY;

export function tdAuthEnabled(): boolean {
  return Boolean(TD_URL() && TD_ANON());
}

export type TdVerifyResult =
  | { ok: true }
  | { ok: false; reason: "wrong" | "not-allowed" | "unavailable" };

/** Checks an email and password against the Trillionaire Designs app. */
export async function verifyWithTd(email: string, password: string): Promise<TdVerifyResult> {
  const url = TD_URL();
  const anon = TD_ANON();
  if (!url || !anon) return { ok: false, reason: "unavailable" };

  let accessToken: string;
  let userId: string;
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method:  "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
      signal:  AbortSignal.timeout(8000),
      cache:   "no-store",
    });
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, reason: "wrong" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const body = await res.json();
    accessToken = body.access_token;
    userId = body.user?.id;
    if (!accessToken || !userId) return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  try {
    // A person switched off in that app can't sign in here either.
    const res = await fetch(`${url}/rest/v1/people?select=active&id=eq.${encodeURIComponent(userId)}`, {
      headers: { apikey: anon, Authorization: `Bearer ${accessToken}` },
      signal:  AbortSignal.timeout(8000),
      cache:   "no-store",
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const rows = (await res.json()) as { active: boolean }[];
    return rows[0]?.active ? { ok: true } : { ok: false, reason: "not-allowed" };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    // The session there was only needed for this check.
    fetch(`${url}/auth/v1/logout`, {
      method:  "POST",
      headers: { apikey: anon, Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }
}

export type TdTokenAudience = "bidii-super-admin" | "bidii-account-check" | "bidii-password-check";

export interface TdToken {
  email: string;
  jti:   string;
  exp:   number;
}

const ISSUER = "trillionaire-designs";

/**
 * Verifies a token signed by the Trillionaire Designs app. Returns null for
 * anything wrong: bad signature, wrong issuer or audience, expired, or
 * lasting longer than two minutes. A sign-in pass can't be used as an account
 * check or the other way round, because the audience must match.
 * One-time use of sign-in passes is enforced by the caller, which records the jti.
 */
export function verifyTdToken(
  token: string,
  audience: TdTokenAudience,
  now = Math.floor(Date.now() / 1000),
): TdToken | null {
  const secret = process.env.TD_SSO_SECRET;
  if (!secret || secret.length < 32) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const h = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    if (h.alg !== "HS256") return null;
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (p.iss !== ISSUER || p.aud !== audience) return null;
    if (typeof p.exp !== "number" || typeof p.iat !== "number") return null;
    if (p.exp < now || p.iat > now + 30 || p.exp - p.iat > 120) return null;
    if (typeof p.email !== "string" || typeof p.jti !== "string" || p.jti.length < 16) return null;
    return { email: p.email.toLowerCase(), jti: p.jti, exp: p.exp };
  } catch {
    return null;
  }
}

/** The one-time sign-in pass from the "Bidii super admin" button. */
export function verifySsoTicket(ticket: string, now?: number): TdToken | null {
  return verifyTdToken(ticket, "bidii-super-admin", now);
}
