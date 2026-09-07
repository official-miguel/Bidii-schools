/** @type {import('next').NextConfig} */
// withSentryConfig wraps the Next.js config to inject Sentry source-map
// upload and performance instrumentation. The wrapper is a no-op if
// SENTRY_AUTH_TOKEN is not set (local dev / CI without upload).
const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig = {
  reactStrictMode: true,
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Organisation + project slugs from your Sentry dashboard.
  // These are non-sensitive — they are public slugs, not secrets.
  org:     process.env.SENTRY_ORG     ?? "your-org",
  project: process.env.SENTRY_PROJECT ?? "your-project",

  // Upload source maps only when the auth token is available.
  // Set SENTRY_AUTH_TOKEN in Vercel env vars (Settings -> Environment Variables).
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Silence Sentry CLI output in CI logs.
  silent: !process.env.CI,

  // Tree-shake Sentry from the client bundle when DSN is not set.
  disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Automatically instrument server-side components.
  autoInstrumentServerFunctions: true,
});
