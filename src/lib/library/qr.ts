/**
 * src/lib/library/qr.ts
 *
 * HMAC-SHA256 signed QR token helpers for the Library Inventory module.
 *
 * Token format (URL-safe, printable):
 *   base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 *
 * Payload shape: { copy_id: string; school_id: string; issued_at: number }
 *   - copy_id   : LibraryCopy.id (cuid)
 *   - school_id : School.id (cuid)  — binds the token to one school
 *   - issued_at : Unix ms timestamp — lets us detect token age
 *
 * Security guarantees:
 *   1. Forgery: any tampered payload invalidates the HMAC.
 *   2. Cross-school replay: school_id mismatch is rejected before DB lookup.
 *   3. Stale tokens: callers may enforce a max-age check on issued_at.
 *   4. Reissue invalidation: the DB stores the current qrToken; any token
 *      whose value doesn't match the stored one is silently rejected.
 *
 * The secret is process.env.LIBRARY_QR_SECRET, falling back to
 * process.env.SESSION_SECRET so schools without a dedicated secret still
 * have a signed (non-guessable) token.
 */

import { createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function secret(): string {
  return (
    process.env.LIBRARY_QR_SECRET ??
    process.env.SESSION_SECRET ??
    "bidii-library-dev-secret"
  );
}

/** RFC 4648 §5 base64url — no padding. */
function toB64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface QrPayload {
  copy_id:   string;
  school_id: string;
  issued_at: number; // Unix ms
}

export interface QrVerifyResult {
  valid:   true;
  payload: QrPayload;
}

export interface QrVerifyFailure {
  valid:  false;
  reason: "malformed" | "bad_signature" | "school_mismatch";
}

export type QrVerifyOutcome = QrVerifyResult | QrVerifyFailure;

// ---------------------------------------------------------------------------
// mintQrToken
// ---------------------------------------------------------------------------

/**
 * Create a new signed QR token for a copy.
 * Returns the token string — caller persists it to LibraryCopy.qrToken
 * and sets qrIssuedAt = new Date().
 */
export function mintQrToken(copyId: string, schoolId: string): string {
  const payload: QrPayload = {
    copy_id:   copyId,
    school_id: schoolId,
    issued_at: Date.now(),
  };

  const payloadB64   = toB64url(Buffer.from(JSON.stringify(payload)));
  const sig          = createHmac("sha256", secret())
    .update(payloadB64)
    .digest();
  const sigB64       = toB64url(sig);

  return `${payloadB64}.${sigB64}`;
}

// ---------------------------------------------------------------------------
// verifyQrToken
// ---------------------------------------------------------------------------

/**
 * Verify a token and decode its payload.
 * Does NOT perform a DB lookup — callers must additionally confirm that
 * the token matches LibraryCopy.qrToken (to enforce reissue invalidation)
 * and that LibraryCopy.schoolId matches the authenticated user's schoolId.
 */
export function verifyQrToken(
  token:    string,
  schoolId: string
): QrVerifyOutcome {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };

  const [payloadB64, sigB64] = parts;

  // Recompute expected HMAC
  const expectedSig = createHmac("sha256", secret())
    .update(payloadB64)
    .digest();
  const expectedB64 = toB64url(expectedSig);

  // Constant-time comparison to resist timing attacks
  const provided = fromB64url(sigB64);
  const expected = fromB64url(expectedB64);

  if (
    provided.length !== expected.length ||
    !safeEqual(provided, expected)
  ) {
    return { valid: false, reason: "bad_signature" };
  }

  // Decode payload
  let payload: QrPayload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (!payload.copy_id || !payload.school_id || !payload.issued_at) {
    return { valid: false, reason: "malformed" };
  }

  // School binding check — prevents cross-school token replay
  if (payload.school_id !== schoolId) {
    return { valid: false, reason: "school_mismatch" };
  }

  return { valid: true, payload };
}

/** Constant-time buffer equality (same length assumed from caller). */
function safeEqual(a: Buffer, b: Buffer): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// isSignedToken
// ---------------------------------------------------------------------------

/**
 * Quick heuristic: does this string look like one of our signed tokens?
 * Used by the resolve endpoint to decide how to route a lookup.
 */
export function isSignedToken(s: string): boolean {
  // Two base64url segments separated by a single dot, second is 43 chars
  // (256-bit HMAC = 32 bytes → 43 base64url chars without padding)
  const idx = s.lastIndexOf(".");
  if (idx < 1) return false;
  const sigPart = s.slice(idx + 1);
  return sigPart.length === 43 && /^[A-Za-z0-9_-]+$/.test(sigPart);
}
