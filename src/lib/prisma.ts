import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Connection pool configuration — Supabase Postgres (session pooler)
//
// Supabase exposes two pooler endpoints:
//   • Session pooler  (port 5432) — one Postgres connection per client session.
//     Safe for Prisma migrations and general runtime use.
//   • Transaction pooler (port 6543) — PgBouncer in transaction mode.
//     Does NOT support prepared statements; use statement_cache_size=0 and
//     pgbouncer=true if you switch to this port.
//
// The active DATABASE_URL in .env points to the session pooler (5432).
//
// connect_timeout=20 — gives the pooler up to 20 s to establish a backend
// connection before Prisma gives up (default is 5 s).
//
// pool_timeout=30 — seconds Prisma waits for a free connection slot before
// throwing "Timed out fetching a new connection". Raised above the default
// of 10 to handle bursts of concurrent server-component renders.
//
// DATABASE_POOL_SIZE: override the per-process pool size. Defaults to 10.
// ---------------------------------------------------------------------------

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Default pool size of 10.
const poolSize = parseInt(process.env.DATABASE_POOL_SIZE ?? "10", 10);

// Build the datasource URL, enforcing sensible connection params.
function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? "";
  if (!base) return base;
  try {
    const url = new URL(base);

    // Per-process pool size.
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(poolSize));
    }

    // How long Prisma waits for the pooler to hand over a connection.
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "20");
    }

    // How long Prisma waits for a free slot in its own internal pool.
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }

    // TCP keepalives — keeps idle connections alive through load-balancer
    // idle-timeout windows.
    if (!url.searchParams.has("keepalives")) {
      url.searchParams.set("keepalives", "1");
    }
    if (!url.searchParams.has("keepalives_idle")) {
      url.searchParams.set("keepalives_idle", "10");
    }

    return url.toString();
  } catch {
    return base; // malformed URL — leave untouched, Prisma will surface the error
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
    datasources: {
      db: { url: buildDatabaseUrl() },
    },
  });

// Prevents exhausting Postgres connections from Next.js dev-mode hot reload,
// which re-evaluates modules on every file save.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
