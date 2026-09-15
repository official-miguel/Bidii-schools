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
 *  LOGIN endpoint:
 *    Counts FAILED attempts only — a correct password costs nothing and clears
 *    the count. If Redis is not configured the counting is skipped with a
 *    warning rather than refusing every login, since locking an entire school
 *    out of its own system is the worse failure.
 *
 *  PARENT routes (lower-stakes, already authenticated):
 *    If Redis is not configured, rate-limiting is SKIPPED with a console.warn.
 *    A misconfiguration should not lock out parents who are already logged in.
 *
 * Call `checkLoginBlocked` / `recordFailedLogin` / `clearFailedLogins` from
 * the login route.
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

let _parentLimiter:          Ratelimit | null = null;
let _otpRequestLimiter:      Ratelimit | null = null;

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

// ── Login protection ──────────────────────────────────────────────────────────
//
// Only FAILED attempts are counted. A correct password costs nothing and
// clears whatever failures preceded it, so a user who mistypes and then gets
// it right is never delayed.
//
// This matters most for the per-IP counter. A school sits behind one public
// IP, so every teacher, bursar and parent logging in from the premises shares
// it. The previous limiter consumed a token on *every* attempt, successful
// ones included, and allowed only ten per IP per fifteen minutes — so on a
// busy morning the eleventh person to sign in was refused even though their
// password was right and they had never failed once. Counting only failures
// removes that entirely while keeping brute-force protection.

/** How long a failure is remembered. */
const LOGIN_WINDOW_SECONDS = 15 * 60;

/**
 * Failed attempts on one account before it is paused. Generous on purpose:
 * this is meant to stop password guessing, not to punish someone who cannot
 * remember whether their password has a capital letter.
 */
const MAX_FAILURES_PER_IDENTIFIER = 10;

/**
 * Failed attempts from one IP before it is paused. Deliberately high, because
 * an entire school shares a single IP — this is a backstop against a flood
 * from one source, not a per-person limit.
 */
const MAX_FAILURES_PER_IP = 50;

function identifierKey(identifier: string): string {
  return `rl:login:fail:id:${identifier.toLowerCase().trim()}`;
}
function ipKey(ip: string): string {
  return `rl:login:fail:ip:${ip}`;
}

/** Reads a counter and how long is left on it, without changing either. */
async function readCounter(key: string): Promise<{ count: number; ttl: number }> {
  const redis = getRedis();
  if (!redis) return { count: 0, ttl: 0 };
  try {
    const [raw, ttl] = await Promise.all([redis.get<number | string>(key), redis.ttl(key)]);
    return { count: Number(raw ?? 0), ttl: ttl > 0 ? ttl : 0 };
  } catch {
    return { count: 0, ttl: 0 };
  }
}

export type LoginBlockResult =
  | { blocked: false }
  | { blocked: true; scope: "identifier" | "ip"; retryAfterSeconds: number };

/**
 * Whether login is currently paused for this account or IP because of earlier
 * failures. Consumes nothing — call it before verifying the password.
 *
 * Fails OPEN when Redis is not configured: a missing env var must not lock
 * every school out of its own system.
 */
export async function checkLoginBlocked(
  ip: string,
  identifier: string
): Promise<LoginBlockResult> {
  if (!getRedis()) return { blocked: false };

  const [byId, byIp] = await Promise.all([
    readCounter(identifierKey(identifier)),
    readCounter(ipKey(ip)),
  ]);

  if (byId.count >= MAX_FAILURES_PER_IDENTIFIER) {
    return {
      blocked: true,
      scope: "identifier",
      retryAfterSeconds: byId.ttl || LOGIN_WINDOW_SECONDS,
    };
  }
  if (byIp.count >= MAX_FAILURES_PER_IP) {
    return {
      blocked: true,
      scope: "ip",
      retryAfterSeconds: byIp.ttl || LOGIN_WINDOW_SECONDS,
    };
  }
  return { blocked: false };
}

/** Records one failed attempt. Best-effort — never breaks the login flow. */
export async function recordFailedLogin(ip: string, identifier: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await Promise.all(
      [identifierKey(identifier), ipKey(ip)].map(async (key) => {
        const n = await redis.incr(key);
        // Start the window on the first failure only, so the clock runs from
        // the first failure rather than being pushed back by each new one.
        if (n === 1) await redis.expire(key, LOGIN_WINDOW_SECONDS);
      })
    );
  } catch {
    // Swallow — a counter that cannot be written must not block a valid login.
  }
}

/**
 * Clears the failure counters after a successful login, so earlier fumbles
 * never count against the next person to use the same network.
 */
export async function clearFailedLogins(ip: string, identifier: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(identifierKey(identifier), ipKey(ip));
  } catch {
    // Best-effort cleanup.
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
