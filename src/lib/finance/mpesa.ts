/**
 * src/lib/finance/mpesa.ts
 *
 * M-Pesa C2B integration utilities for the Fees & Ledger module.
 *
 * verifyHmac       — validates the x-mpesa-signature header on incoming callbacks.
 * matchAdmissionNumber — exact match first, then Levenshtein fuzzy match.
 *
 * Security: uses timingSafeEqual to prevent timing attacks on HMAC comparison.
 */

import { createHmac, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// HMAC verification
// ---------------------------------------------------------------------------

/**
 * Verifies the HMAC-SHA256 signature of an M-Pesa C2B callback body.
 *
 * @param secret    - Plaintext webhook secret (already decrypted from DB)
 * @param rawBody   - The raw request body string (before JSON.parse)
 * @param signature - The value of the x-mpesa-signature header
 * @returns true if the signature is valid
 */
export function verifyHmac(
  secret: string,
  rawBody: string,
  signature: string
): boolean {
  try {
    const expected = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    const expectedBuf  = Buffer.from(expected,   "hex");
    const signatureBuf = Buffer.from(signature,  "hex");

    // Lengths must match before timingSafeEqual (it throws on mismatch)
    if (expectedBuf.length !== signatureBuf.length) return false;

    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Levenshtein distance — pure implementation, no external deps
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use a single-row DP to save memory
  const dp = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = dp[j - 1];
      } else {
        dp[j] = 1 + Math.min(dp[j], dp[j - 1], prev);
      }
      dp[j - 1] = prev;
      prev = temp;
    }
    dp[n] = prev;
  }

  return dp[n];
}

// ---------------------------------------------------------------------------
// Admission number matching
// ---------------------------------------------------------------------------

export interface MatchResult {
  admissionNumber: string;
  confidence: number; // 0.0 – 1.0; 1.0 = exact match
  studentId?: string;
}

/**
 * Tries to match a raw M-Pesa account number against a list of known
 * admission numbers. Returns the best match (or null if no plausible match).
 *
 * Algorithm:
 *  1. Exact match (case-insensitive, trimmed) → confidence 1.0
 *  2. Levenshtein closest match → normalised confidence = 1 − (distance / maxLen)
 *
 * @param candidates - Array of { admissionNumber, studentId } objects for the school
 * @param raw        - The rawAccountNumber from the M-Pesa callback
 * @param minConfidence - Minimum confidence to include in results (default 0.5)
 */
export function matchAdmissionNumber(
  candidates: Array<{ admissionNumber: string; studentId: string }>,
  raw: string,
  minConfidence = 0.5
): MatchResult | null {
  if (!candidates.length || !raw.trim()) return null;

  const normalised = raw.trim().toUpperCase();

  // 1. Exact match (case-insensitive)
  const exact = candidates.find(
    (c) => c.admissionNumber.trim().toUpperCase() === normalised
  );
  if (exact) {
    return {
      admissionNumber: exact.admissionNumber,
      confidence: 1.0,
      studentId: exact.studentId,
    };
  }

  // 2. Levenshtein closest match
  let bestDistance = Infinity;
  let bestCandidate: (typeof candidates)[0] | null = null;

  for (const candidate of candidates) {
    const dist = levenshtein(
      normalised,
      candidate.admissionNumber.trim().toUpperCase()
    );
    if (dist < bestDistance) {
      bestDistance  = dist;
      bestCandidate = candidate;
    }
  }

  if (!bestCandidate) return null;

  const maxLen     = Math.max(normalised.length, bestCandidate.admissionNumber.length);
  const confidence = maxLen === 0 ? 0 : 1 - bestDistance / maxLen;

  if (confidence < minConfidence) return null;

  return {
    admissionNumber: bestCandidate.admissionNumber,
    confidence:      parseFloat(confidence.toFixed(4)),
    studentId:       bestCandidate.studentId,
  };
}
