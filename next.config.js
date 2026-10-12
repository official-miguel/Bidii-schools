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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No framing by other sites (clickjacking); same-origin framing,
          // e.g. print previews, keeps working.
          { key: "X-Frame-Options",         value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options",  value: "nosniff" },
          { key: "Referrer-Policy",         value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Installed apps must always see the newest worker and manifest, or a
        // fix to offline/push behaviour never reaches them.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type",  value: "application/manifest+json" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Android TWA / Digital Asset Links verification file.
        // App Router can't build a literal ".well-known" folder, so this
        // path is served by /api/assetlinks instead.
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
    ];
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
