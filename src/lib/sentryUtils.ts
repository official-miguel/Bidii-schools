/**
 * src/lib/sentryUtils.ts
 *
 * Shared PII scrubbing helper for all three Sentry config files.
 *
 * Strips fields associated with personal data before events reach Sentry.
 * Extend SENSITIVE_KEYS as the schema grows.
 */
import type { ErrorEvent as SentryEvent } from "@sentry/nextjs";

/** Keys whose values must never reach Sentry (case-insensitive, symbols stripped). */
const SENSITIVE_KEYS = new Set([
  "email", "phone", "phonenumber",
  "password", "passwordhash",
  "token", "accesstoken", "sessiontoken", "offlinetoken",
  "authorization", "cookie", "setcookie", "xauthtoken",
  "apikey", "secret",
  "integrationencryptionkey", "databaseurl", "directurl",
  "supabaseservicerolekey", "sessionsecret", "cronsecret",
  "upstashredisresttoken",
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_\s]/g, ""));
}

function scrubObject(obj: unknown, depth = 0): unknown {
  if (depth > 10 || obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((v) => scrubObject(v, depth + 1));
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? "[Filtered]" : scrubObject(value, depth + 1);
    }
    return result;
  }
  return obj;
}

/**
 * Sentry beforeSend hook: scrub PII before the event leaves the process.
 */
export function scrubSensitiveFields(event: SentryEvent): SentryEvent | null {
  if (event.request) {
    if (event.request.headers) {
      event.request.headers = scrubObject(event.request.headers) as Record<string, string>;
    }
    if (event.request.data) {
      event.request.data = scrubObject(event.request.data);
    }
    if (event.request.cookies) {
      // cookies is Record<string, string> — replace each value with [Filtered]
      event.request.cookies = Object.fromEntries(
        Object.keys(event.request.cookies).map((k) => [k, "[Filtered]"])
      );
    }
  }
  if (event.user) {
    event.user = { id: event.user.id };
  }
  if (event.extra) {
    event.extra = scrubObject(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = scrubObject(event.contexts) as Record<string, Record<string, unknown>>;
  }
  return event;
}
