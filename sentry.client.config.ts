/**
 * sentry.client.config.ts
 *
 * Sentry initialisation for the browser / client bundle.
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/
 *
 * Set NEXT_PUBLIC_SENTRY_DSN in .env and Vercel env vars.
 * If not set, Sentry is a no-op (events silently dropped).
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveFields } from "@/lib/sentryUtils";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 10 % of transactions sampled. Raise after you understand traffic.
  tracesSampleRate: 0.1,
  // Session replay disabled by default.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // PII scrubbing — strips emails, phones, tokens before events leave the browser.
  beforeSend(event) { return scrubSensitiveFields(event); },
});
