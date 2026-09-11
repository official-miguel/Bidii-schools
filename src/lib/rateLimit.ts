/**
 * src/lib/rateLimit.ts
 *
 * Distributed, Redis-backed rate limiter using Upstash Redis + @upstash/ratelimit.
 *
 * Why Upstash?  Serverless-friendly REST API (no persistent TCP connection),
 * generous free tier, and official @upstash/ratelimit library that handles
 * sliding-window counters atomically.
 *
 * ── Fail-open vs fail-closed behaviour ───────────────────────────────────────
 *
 *  LOGIN endpoint (high-stakes):
 *    If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set, ALL
 *    login attempts are REJECTED with a 503 error.  A misconfigured deployment
 *    must not allow unlimited brute-force just because Redis is absent.
 *
 *  PARENT routes (lower-stakes, already authenticated):
 *    If Redis is not configured, rate-limiting is SKIPPED with a console.warn.
 *    A misconfiguration should not lock out parents who are already logged in.
 *
 * Call `checkLoginRateLimit` from the login route.
 * Call `checkRateLimit` from the 14 parent routes (same signature as before,
 * but now returns Promise<boolean>).
 *
 * Requirements: 12.6
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis }     from "@upstash/redis";

// ── Shared Redis client (lazily instantiated once) ────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

// ── Rate-limiter instances (lazily created) ───────────────────────────────────

let _loginIpLimiter:         Ratelimit | null = null;
let _loginIdentifierLimiter: Ratelimit | null = null;
let _parentLimiter:          Ratelimit | null = null;
let _otpRequestLimiter:      Ratelimit | null = null;

function getLoginIpLimiter(): Ratelimit | null {
  if (_loginIpLimiter) return _loginIpLimiter;
  const redis = getRedis();
  if (!redis) return null;
  // 10 attempts per IP per 15 minutes
  _loginIpLimiter = new Ratelimit({
    redis,
    limiter:   Ratelimit.slidingWindow(10, "15 m"),
    prefix:    "rl:login:ip",
    analytics: false,
  });
  return _loginIpLimiter;
}

function getLoginIdentifierLimiter(): Ratelimit | null {
  if (_loginIdentifierLimiter) return _loginIdentifierLimiter;
  const redis = getRedis();
  if (!redis) return null;
  // 5 failed attempts per identifier per 15 minutes
  _loginIdentifierLimiter = new Ratelimit({
    redis,
    limiter:   Ratelimit.slidingWindow(5, "15 m"),
    prefix:    "rl:login:id",
    analytics: false,
  });
  return _loginIdentifierLimiter;
}

function getParentLimiter(): Ratelimit | null {
  if (_parentLimiter) return _parentLimiter;
  const redis = getRedis();
  if (!redis) return null;
  // 60 requests per 60 seconds per userId (matches old in-memory window)
  _parentLimiter = new Ratelimit({
    redis,
    limiter:   Ratelimit.slidingWindow(60, "60 s"),
    prefix:    "rl:parent",
    analytics: false,
  });
  return _parentLimiter;
}

function getOtpRequestLimiter(): Ratelimit | null {
  if (_otpRequestLimiter) return _otpRequestLimiter;
  const redis = getRedis();
  if (!redis) return null;
  // 3 OTP requests per 15 minutes per identifier — fail-closed
  _otpRequestLimiter = new Ratelimit({
    redis,
    limiter:   Ratelimit.slidingWindow(3, "15 m"),
    prefix:    "rl:otp:req",
    analytics: false,
  });
  return _otpRequestLimiter;
}

// ── Public API ────────────────────────────────────────────────────────────────

export type LoginRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "ip_limit" | "identifier_limit" | "redis_unavailable" };

/**
 * Check both IP-level and identifier-level rate limits for login attempts.
 *
 * Fail-CLOSED: if Redis is not configured, returns { allowed: false, reason:
 * "redis_unavailable" } so the login endpoint rejects rather than allows
 * unlimited attempts.
 *
 * Call this BEFORE password verification.
 */
export async function checkLoginRateLimit(
  ip: string,
  identifier: string
): Promise<LoginRateLimitResult> {
  const ipLimiter         = getLoginIpLimiter();
  const identifierLimiter = getLoginIdentifierLimiter();

  if (!ipLimiter || !identifierLimiter) {
    // Redis not configured — fail open so login is never blocked by a missing env var.
    // Rate limiting is simply skipped; all other auth checks (password, account status) still apply.
    console.warn(
      "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — login rate limiting DISABLED. " +
      "Set these env vars to enable distributed rate limiting."
    );
    return { allowed: true };
  }

  const [ipResult, idResult] = await Promise.all([
    ipLimiter.limit(ip),
    identifierLimiter.limit(identifier.toLowerCase().trim()),
  ]);

  if (!ipResult.success) return { allowed: false, reason: "ip_limit" };
  if (!idResult.success) return { allowed: false, reason: "identifier_limit" };
  return { allowed: true };
}

/**
 * Reset the per-identifier sliding window on a successful login so a user
 * who eventually provides the right password isn't locked out for 15 minutes.
 *
 * This is best-effort; a Redis error here must not break the login flow.
 */
export async function resetLoginIdentifierLimit(identifier: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    // Delete the counter key directly — the prefix + key matches what
    // @upstash/ratelimit writes internally.
    const key = `rl:login:id:${identifier.toLowerCase().trim()}`;
    await redis.del(key);
  } catch {
    // Swallow — this is a best-effort cleanup
  }
}

/**
 * Rate limit for authenticated parent routes (lower-stakes).
 *
 * Fail-OPEN: if Redis is not configured, logs a warning and returns true
 * so a misconfiguration doesn't lock out already-authenticated parents.
 *
 * Returns a Promise<boolean> — true = allowed, false = rate limited.
 * Replaces the previous synchronous checkRateLimit(userId).
 */
export async function checkRateLimit(userId: string): Promise<boolean> {
  const limiter = getParentLimiter();

  if (!limiter) {
    // Fail open with a warning — do NOT silently allow without logging
    console.warn(
      "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — parent rate limiting is DISABLED. " +
      "Set these env vars to enable distributed rate limiting."
    );
    return true;
  }

  const result = await limiter.limit(userId);
  return result.success;
}

export type OtpRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "identifier_limit" };

/**
 * Rate limit for forgot-password OTP requests.
 *
 * Fail-OPEN: if Redis is not configured, logs a warning and returns
 * { allowed: true } — this allows the OTP flow to work even without Redis,
 * though SMS costs are not protected in that scenario.
 *
 * Max 3 requests per identifier per 15 minutes (when Redis is available).
 */
export async function checkOtpRequestRateLimit(
  identifier: string
): Promise<OtpRateLimitResult> {
  const limiter = getOtpRequestLimiter();

  if (!limiter) {
    console.warn(
      "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — OTP rate limiting is DISABLED. " +
      "Set these env vars to enable distributed rate limiting and protect SMS costs."
    );
    return { allowed: true };
  }

  const result = await limiter.limit(identifier.toLowerCase().trim());
  if (!result.success) return { allowed: false, reason: "identifier_limit" };
  return { allowed: true };
}
