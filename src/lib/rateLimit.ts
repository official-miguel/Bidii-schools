/**
 * In-memory rate limiter — 60 requests per 60-second window per userId.
 *
 * NOTE: This is a single-process in-memory implementation. For multi-instance
 * deployments this should be replaced with a Redis-backed implementation.
 *
 * Requirements: 12.6
 */

const requestCounts = new Map<string, { count: number; resetAt: number }>();

/**
 * Returns true if the userId is within the allowed rate limit,
 * false if the limit has been exceeded.
 *
 * Window: 60 requests per 60 seconds, rolling per userId.
 */
export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(userId);

  if (!entry || entry.resetAt < now) {
    // New window
    requestCounts.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 60) {
    return false;
  }

  entry.count++;
  return true;
}
