/**
 * src/__tests__/auth-guards.test.ts
 *
 * Guards that must never regress in production:
 *
 *  1. DEV_BYPASS_AUTH is unreachable when NODE_ENV === "production".
 *     The bypass is gated on `process.env.NODE_ENV !== "production"`, so
 *     setting NODE_ENV=production must always return null regardless of
 *     DEV_BYPASS_AUTH value.
 *
 * Strategy: mock the module dependencies so no real DB or cookie jar is
 * needed, then exercise getCurrentUser() under different env combinations.
 */

// ── Mock React cache — not available outside Next.js runtime ─────────────────
// `cache` is a React 18 server-component API. Jest runs in Node/jsdom where it
// doesn't exist. We replace it with an identity wrapper so auth.ts loads fine.
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

// ── Mock next/headers (cookies) ───────────────────────────────────────────────
jest.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

// ── Mock Prisma — no real DB needed ──────────────────────────────────────────
jest.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}));

import { getCurrentUser } from "@/lib/auth";

// Helper: run getCurrentUser in a controlled env snapshot and restore after.
async function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<void>
) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// getCurrentUser is memoised with React cache; clear it between tests.
// We re-import the module fresh each time by resetting the module registry.
beforeEach(() => {
  jest.resetModules();
});

describe("DEV_BYPASS_AUTH production guard", () => {
  it("returns null in production even when DEV_BYPASS_AUTH is set", async () => {
    await withEnv(
      { NODE_ENV: "production", DEV_BYPASS_AUTH: "PRINCIPAL" },
      async () => {
        // Re-import after env change so the module re-evaluates
        const { getCurrentUser: getCurrent } = await import("@/lib/auth");
        const user = await getCurrent();
        expect(user).toBeNull();
      }
    );
  });

  it("returns null in production when DEV_BYPASS_AUTH is not set", async () => {
    await withEnv(
      { NODE_ENV: "production", DEV_BYPASS_AUTH: undefined },
      async () => {
        const { getCurrentUser: getCurrent } = await import("@/lib/auth");
        const user = await getCurrent();
        expect(user).toBeNull();
      }
    );
  });

  it("returns a dev user in non-production when DEV_BYPASS_AUTH is set", async () => {
    await withEnv(
      { NODE_ENV: "test", DEV_BYPASS_AUTH: "PRINCIPAL", DEV_BYPASS_SCHOOL_ID: "school-abc" },
      async () => {
        const { getCurrentUser: getCurrent } = await import("@/lib/auth");
        const user = await getCurrent();
        expect(user).not.toBeNull();
        expect(user?.role).toBe("PRINCIPAL");
        expect(user?.id).toBe("dev-bypass-user");
      }
    );
  });

  it("returns null in non-production when DEV_BYPASS_AUTH is not set and no session exists", async () => {
    await withEnv(
      { NODE_ENV: "test", DEV_BYPASS_AUTH: undefined },
      async () => {
        const { getCurrentUser: getCurrent } = await import("@/lib/auth");
        const user = await getCurrent();
        expect(user).toBeNull();
      }
    );
  });
});
