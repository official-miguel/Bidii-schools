/**
 * sentry.edge.config.ts
 * Sentry initialisation for Vercel Edge Runtime.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveFields } from "./src/lib/sentryUtils";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.05,
  beforeSend(event) { return scrubSensitiveFields(event); },
});
