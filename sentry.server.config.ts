/**
 * sentry.server.config.ts
 * Sentry initialisation for the Node.js server bundle (API routes, RSC).
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveFields } from "./src/lib/sentryUtils";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) { return scrubSensitiveFields(event); },
});
